import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env';
import {
  applyQuery,
  stripUndefined,
  type Collection,
  type Datastore,
  type Doc,
  type QueryOptions,
  type Transaction,
} from './datastore';
import { countRead } from './metrics';

/**
 * Cópia profunda. Leituras devolvem cópias, nunca o objeto do cache: quem
 * lê e altera em memória (a baixa de estoque faz isso) não pode mutar o
 * banco por acidente antes de gravar — nem escapar do rollback.
 */
const clone = <T>(value: T): T => structuredClone(value);

/**
 * Driver de desenvolvimento: coleções em arquivos JSON dentro de `server/.data`.
 * Mesma superfície do Firestore, incluindo transações (serializadas por uma
 * fila em memória, com rollback do snapshot em caso de erro).
 */
class LocalCollection<T extends Doc> implements Collection<T> {
  private cache: Map<string, T> | null = null;
  /** mtime do arquivo na última leitura — detecta escrita de outro processo. */
  private loadedAt = -1;

  constructor(
    readonly name: string,
    private readonly store: LocalDatastore,
  ) {}

  private get file(): string {
    return path.join(env.dataDir, `${this.name}.json`);
  }

  private fileMtime(): number {
    try {
      return fs.statSync(this.file).mtimeMs;
    } catch {
      return -1;
    }
  }

  /**
   * Recarrega do disco quando o arquivo mudou por fora — por exemplo, o
   * `npm run seed` rodado com o servidor de desenvolvimento aberto. Sem isto
   * o seed não aparecia e ainda era sobrescrito no próximo flush.
   */
  private load(): Map<string, T> {
    const mtime = this.fileMtime();
    if (this.cache && mtime === this.loadedAt) return this.cache;

    const map = new Map<string, T>();
    try {
      if (fs.existsSync(this.file)) {
        const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as T[];
        for (const doc of parsed) map.set(doc.id, doc);
      }
    } catch (error) {
      console.warn(`[local-datastore] falha ao ler ${this.name}.json`, error);
    }
    this.cache = map;
    this.loadedAt = mtime;
    return map;
  }

  /** @internal usado pelas transações — cópia profunda, para o rollback valer. */
  snapshot(): Map<string, T> {
    return new Map([...this.load()].map(([id, doc]) => [id, clone(doc)]));
  }

  /** @internal usado pelas transações (rollback). */
  restore(snapshot: Map<string, T>): void {
    this.cache = snapshot;
    this.flush();
  }

  private flush(): void {
    fs.mkdirSync(env.dataDir, { recursive: true });
    const docs = [...(this.cache ?? this.load()).values()];
    fs.writeFileSync(this.file, JSON.stringify(docs, null, 2), 'utf8');
    // a escrita foi nossa: alinhar o mtime evita uma releitura à toa
    this.loadedAt = this.fileMtime();
  }

  async get(id: string): Promise<T | null> {
    const doc = this.load().get(id);
    countRead(this.name, 1);
    return doc ? clone(doc) : null;
  }

  async list(options?: QueryOptions): Promise<T[]> {
    const result = applyQuery([...this.load().values()], options);
    countRead(this.name, Math.max(result.length, 1));
    return result.map(clone);
  }

  async findOne(options: QueryOptions): Promise<T | null> {
    const [first] = applyQuery([...this.load().values()], { ...options, limit: 1 });
    countRead(this.name, 1);
    return first ? clone(first) : null;
  }

  async set(doc: T): Promise<T> {
    this.writeSync(doc);
    this.flush();
    return doc;
  }

  async update(id: string, patch: Partial<T>): Promise<void> {
    this.patchSync(id, patch);
    this.flush();
  }

  async remove(id: string): Promise<void> {
    this.load().delete(id);
    this.flush();
  }

  async count(options?: QueryOptions): Promise<number> {
    countRead(this.name, 1);
    return applyQuery([...this.load().values()], options).length;
  }

  /** @internal escrita sem persistir (a transação persiste no commit). */
  writeSync(doc: T): void {
    this.load().set(doc.id, stripUndefined(doc));
  }

  /** @internal */
  patchSync(id: string, patch: Partial<T>): void {
    const current = this.load().get(id);
    if (!current) throw new Error(`Documento ${this.name}/${id} não encontrado.`);
    this.load().set(id, stripUndefined({ ...current, ...patch }));
  }

  /** @internal */
  removeSync(id: string): void {
    this.load().delete(id);
  }

  /** @internal */
  persist(): void {
    this.flush();
  }
}

export class LocalDatastore implements Datastore {
  readonly driver = 'local' as const;
  private readonly collections = new Map<string, LocalCollection<never>>();
  private queue: Promise<unknown> = Promise.resolve();

  collection<T extends Doc>(name: string): Collection<T> {
    let existing = this.collections.get(name) as LocalCollection<T> | undefined;
    if (!existing) {
      existing = new LocalCollection<T>(name, this);
      this.collections.set(name, existing as unknown as LocalCollection<never>);
    }
    return existing;
  }

  async runTransaction<R>(handler: (tx: Transaction) => Promise<R>): Promise<R> {
    const run = async (): Promise<R> => {
      const touched = new Set<LocalCollection<never>>();
      const snapshots = new Map<LocalCollection<never>, Map<string, never>>();

      // Resolvida pelo nome, nunca pela referência recebida: quem chama pode
      // estar passando um wrapper (cache), e a transação precisa da coleção
      // real para tirar o retrato e desfazer em caso de erro.
      const remember = (collection: Collection<Doc>) => {
        const local = this.collection(collection.name) as unknown as LocalCollection<never>;
        if (!snapshots.has(local)) snapshots.set(local, local.snapshot());
        touched.add(local);
        return local;
      };

      const tx: Transaction = {
        get: async (collection, id) => this.collection(collection.name).get(id) as never,
        set: (collection, doc) => {
          remember(collection as Collection<Doc>).writeSync(doc as never);
        },
        update: (collection, id, patch) => {
          remember(collection as Collection<Doc>).patchSync(id, patch as never);
        },
        remove: (collection, id) => {
          remember(collection as Collection<Doc>).removeSync(id);
        },
      };

      try {
        const result = await handler(tx);
        for (const collection of touched) collection.persist();
        return result;
      } catch (error) {
        for (const [collection, snapshot] of snapshots) collection.restore(snapshot);
        throw error;
      }
    };

    // serializa transações para simular o isolamento do Firestore
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }
}
