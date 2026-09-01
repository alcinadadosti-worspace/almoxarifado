/**
 * Contagem de leituras do Firestore.
 *
 * O plano gratuito dá 50 mil leituras por dia, e no Firestore o custo não está
 * na requisição e sim no número de documentos que ela devolve: uma listagem de
 * 109 colaboradores custa 109 leituras. Sem medir isso, qualquer otimização é
 * chute — daí este contador, exposto em `/api/health`.
 */

export interface ReadStats {
  /** Documentos efetivamente lidos (o que o Firestore cobra). */
  documents: number;
  /** Chamadas feitas, para distinguir "1 query cara" de "muitas baratas". */
  operations: number;
  /** Leituras evitadas pelo cache. */
  cacheHits: number;
}

const empty = (): ReadStats => ({ documents: 0, operations: 0, cacheHits: 0 });

const total = empty();
const byCollection = new Map<string, ReadStats>();
let since = new Date();

const bucket = (collection: string): ReadStats => {
  let stats = byCollection.get(collection);
  if (!stats) {
    stats = empty();
    byCollection.set(collection, stats);
  }
  return stats;
};

/** Registra documentos lidos do banco. */
export function countRead(collection: string, documents: number): void {
  total.documents += documents;
  total.operations += 1;
  const stats = bucket(collection);
  stats.documents += documents;
  stats.operations += 1;
}

/** Registra uma leitura servida pelo cache — não custa nada no Firestore. */
export function countCacheHit(collection: string, documents: number): void {
  total.cacheHits += documents;
  bucket(collection).cacheHits += documents;
}

export function readMetrics() {
  const collections = Object.fromEntries(
    [...byCollection.entries()]
      .sort((a, b) => b[1].documents - a[1].documents)
      .map(([name, stats]) => [name, { ...stats }]),
  );
  const elapsedHours = (Date.now() - since.getTime()) / 3_600_000;
  return {
    since: since.toISOString(),
    documentsRead: total.documents,
    operations: total.operations,
    servedFromCache: total.cacheHits,
    /** Projeção simples para 24 h no ritmo atual — o teto gratuito é 50 000. */
    projectedPerDay: elapsedHours > 0.01 ? Math.round((total.documents / elapsedHours) * 24) : null,
    collections,
  };
}

export function resetMetrics(): void {
  total.documents = 0;
  total.operations = 0;
  total.cacheHits = 0;
  byCollection.clear();
  since = new Date();
}
