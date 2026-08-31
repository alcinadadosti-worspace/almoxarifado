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

/**
 * Driver de desenvolvimento: coleções em arquivos JSON dentro de `server/.data`.
 * Mesma superfície do Firestore, incluindo transações (serializadas por uma
 * fila em memória, com rollback do snapshot em caso de erro).
 */
class LocalCollection<T extends Doc> implements Collection<T> {
  private cache: Map<string, T> | null = null;

  constructor(
    readonly name: string,
    private readonly store: LocalDatastore,
  ) {}

  private get file(): string {
    return path.join(env.dataDir, `${this.name}.json`);
  }

  private load(): Map<string, T> {
    if (this.cache) return this.cache;
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
    return map;
  }

  /** @internal usado pelas transações. */
  snapshot(): Map<string, T> {
    return new Map(this.load());
  }

  /** @internal usado pelas transações (rollback). */
  restore(snapshot: Map<string, T>): void {
    this.cache = snapshot;
    this.flush();
  }

  private flush(): void {
    fs.mkdirSync(env.dataDir, { recursive: true });
    const docs = [...this.load().values()];
    fs.writeFileSync(this.file, JSON.stringify(docs, null, 2), 'utf8');
  }

  async get(id: string): Promise<T | null> {
    return this.load().get(id) ?? null;
  }

  async list(options?: QueryOptions): Promise<T[]> {
    return applyQuery([...this.load().values()], options);
  }

  async findOne(options: QueryOptions): Promise<T | null> {
    const [first] = applyQuery([...this.load().values()], { ...options, limit: 1 });
    return first ?? null;
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
      const remember = (collection: Collection<Doc>) => {
        const local = collection as unknown as LocalCollection<never>;
        if (!snapshots.has(local)) snapshots.set(local, local.snapshot());
        touched.add(local);
        return local;
      };

      const tx: Transaction = {
        get: async (collection, id) => collection.get(id),
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
