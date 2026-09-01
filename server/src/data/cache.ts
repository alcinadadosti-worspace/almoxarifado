import { applyQuery, type Collection, type Doc, type QueryOptions } from './datastore';
import { countCacheHit } from './metrics';

/**
 * Cache de coleção em memória.
 *
 * No Firestore o custo é por documento devolvido: listar 109 colaboradores
 * custa 109 leituras, e o painel fazia isso a cada tela aberta e a cada busca
 * digitada. Como catálogo, pessoas e configurações mudam raramente e cabem
 * folgadamente na memória, guardamos a coleção inteira e respondemos filtros e
 * ordenações a partir dela.
 *
 * Só coleções pequenas e estáveis entram aqui. `deliveries` e
 * `stock_movements` crescem sem teto e ficam de fora de propósito.
 *
 * A invalidação é automática em qualquer escrita pela coleção, e o TTL existe
 * como rede de segurança: se um dia houver mais de uma instância do servidor,
 * a janela de divergência é o TTL, não “para sempre”.
 */

const registry = new Set<() => void>();

/** Descarta todos os caches — usado após transações, que escrevem sem passar aqui. */
export function invalidateAllCaches(): void {
  for (const invalidate of registry) invalidate();
}

export function cachedCollection<T extends Doc>(
  collection: Collection<T>,
  ttlMs: number,
): Collection<T> {
  let snapshot: T[] | null = null;
  let expiresAt = 0;

  const invalidate = () => {
    snapshot = null;
    expiresAt = 0;
  };
  registry.add(invalidate);

  /** A coleção inteira, do cache ou do banco. */
  const load = async (): Promise<T[]> => {
    if (snapshot && expiresAt > Date.now()) {
      countCacheHit(collection.name, snapshot.length);
      return snapshot;
    }
    snapshot = await collection.list();
    expiresAt = Date.now() + ttlMs;
    return snapshot;
  };

  return {
    name: collection.name,

    async get(id) {
      // Um documento avulso sai do mesmo retrato: pedir 1 doc ao Firestore
      // custaria uma leitura que o cache já pagou.
      const all = await load();
      return all.find((doc) => doc.id === id) ?? null;
    },

    async list(options?: QueryOptions) {
      return applyQuery(await load(), options);
    },

    async findOne(options: QueryOptions) {
      const [first] = applyQuery(await load(), { ...options, limit: 1 });
      return first ?? null;
    },

    async count(options?: QueryOptions) {
      return applyQuery(await load(), options).length;
    },

    async set(doc) {
      const result = await collection.set(doc);
      invalidate();
      return result;
    },

    async update(id, patch) {
      await collection.update(id, patch);
      invalidate();
    },

    async remove(id) {
      await collection.remove(id);
      invalidate();
    },
  };
}
