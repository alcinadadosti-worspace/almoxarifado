/**
 * Camada de dados desacoplada.
 *
 * Em produção roda sobre **Firestore** (Admin SDK). Sem credenciais, cai para
 * um driver local em arquivo JSON — assim a aplicação sobe e é demonstrável na
 * primeira execução, sem nunca mudar uma linha das regras de negócio.
 */

export type WhereOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'array-contains' | 'in';

export interface QueryOptions {
  where?: Array<[field: string, op: WhereOp, value: unknown]>;
  orderBy?: [field: string, direction: 'asc' | 'desc'];
  limit?: number;
}

export interface Doc {
  id: string;
}

export interface Collection<T extends Doc> {
  readonly name: string;
  get(id: string): Promise<T | null>;
  list(options?: QueryOptions): Promise<T[]>;
  findOne(options: QueryOptions): Promise<T | null>;
  set(doc: T): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<void>;
  remove(id: string): Promise<void>;
  count(options?: QueryOptions): Promise<number>;
}

export interface Transaction {
  get<T extends Doc>(collection: Collection<T>, id: string): Promise<T | null>;
  set<T extends Doc>(collection: Collection<T>, doc: T): void;
  update<T extends Doc>(collection: Collection<T>, id: string, patch: Partial<T>): void;
  remove<T extends Doc>(collection: Collection<T>, id: string): void;
}

export interface Datastore {
  readonly driver: 'firestore' | 'local';
  collection<T extends Doc>(name: string): Collection<T>;
  runTransaction<R>(handler: (tx: Transaction) => Promise<R>): Promise<R>;
}

/** Acesso a campo aninhado ("company.name") para o driver local. */
export function readPath(target: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, target);
}

export function matchesWhere(doc: unknown, clauses: QueryOptions['where']): boolean {
  if (!clauses?.length) return true;
  return clauses.every(([field, op, expected]) => {
    const actual = readPath(doc, field);
    switch (op) {
      case '==': return actual === expected;
      case '!=': return actual !== expected;
      case '<': return (actual as never) < (expected as never);
      case '<=': return (actual as never) <= (expected as never);
      case '>': return (actual as never) > (expected as never);
      case '>=': return (actual as never) >= (expected as never);
      case 'array-contains': return Array.isArray(actual) && actual.includes(expected);
      case 'in': return Array.isArray(expected) && expected.includes(actual);
      default: return true;
    }
  });
}

export function applyQuery<T>(docs: T[], options?: QueryOptions): T[] {
  let result = docs.filter((doc) => matchesWhere(doc, options?.where));
  if (options?.orderBy) {
    const [field, direction] = options.orderBy;
    const sign = direction === 'desc' ? -1 : 1;
    result = [...result].sort((a, b) => {
      const av = readPath(a, field);
      const bv = readPath(b, field);
      if (av === bv) return 0;
      if (av === undefined || av === null) return 1;
      if (bv === undefined || bv === null) return -1;
      return (av < bv ? -1 : 1) * sign;
    });
  }
  if (options?.limit != null) result = result.slice(0, options.limit);
  return result;
}

/** Remove `undefined` recursivamente (o Firestore recusa esses campos). */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripUndefined(v)) as unknown as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (val !== undefined) out[key] = stripUndefined(val);
    }
    return out as T;
  }
  return value;
}
