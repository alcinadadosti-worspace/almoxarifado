import type admin from 'firebase-admin';
import { getDb } from './firebase';
import {
  stripUndefined,
  type Collection,
  type Datastore,
  type Doc,
  type QueryOptions,
  type Transaction,
} from './datastore';

function buildQuery(
  ref: admin.firestore.CollectionReference,
  options?: QueryOptions,
): admin.firestore.Query {
  let query: admin.firestore.Query = ref;
  for (const [field, op, value] of options?.where ?? []) {
    query = query.where(field, op as admin.firestore.WhereFilterOp, value);
  }
  if (options?.orderBy) query = query.orderBy(options.orderBy[0], options.orderBy[1]);
  if (options?.limit != null) query = query.limit(options.limit);
  return query;
}

class FirestoreCollection<T extends Doc> implements Collection<T> {
  constructor(readonly name: string) {}

  private get ref(): admin.firestore.CollectionReference {
    return getDb().collection(this.name);
  }

  async get(id: string): Promise<T | null> {
    const snapshot = await this.ref.doc(id).get();
    return snapshot.exists ? ({ ...snapshot.data(), id: snapshot.id } as T) : null;
  }

  async list(options?: QueryOptions): Promise<T[]> {
    const snapshot = await buildQuery(this.ref, options).get();
    return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as T);
  }

  async findOne(options: QueryOptions): Promise<T | null> {
    const snapshot = await buildQuery(this.ref, { ...options, limit: 1 }).get();
    const doc = snapshot.docs[0];
    return doc ? ({ ...doc.data(), id: doc.id } as T) : null;
  }

  async set(doc: T): Promise<T> {
    await this.ref.doc(doc.id).set(stripUndefined(doc));
    return doc;
  }

  async update(id: string, patch: Partial<T>): Promise<void> {
    await this.ref.doc(id).set(stripUndefined(patch) as admin.firestore.DocumentData, {
      merge: true,
    });
  }

  async remove(id: string): Promise<void> {
    await this.ref.doc(id).delete();
  }

  async count(options?: QueryOptions): Promise<number> {
    const snapshot = await buildQuery(this.ref, options).count().get();
    return snapshot.data().count;
  }
}

export class FirestoreDatastore implements Datastore {
  readonly driver = 'firestore' as const;
  private readonly collections = new Map<string, Collection<never>>();

  collection<T extends Doc>(name: string): Collection<T> {
    let existing = this.collections.get(name) as Collection<T> | undefined;
    if (!existing) {
      existing = new FirestoreCollection<T>(name);
      this.collections.set(name, existing as unknown as Collection<never>);
    }
    return existing;
  }

  /**
   * ATENÇÃO: como em qualquer transação do Firestore, faça **todas as leituras
   * antes das escritas** dentro do handler.
   */
  async runTransaction<R>(handler: (tx: Transaction) => Promise<R>): Promise<R> {
    const db = getDb();
    return db.runTransaction(async (t) => {
      const tx: Transaction = {
        get: async (collection, id) => {
          const snapshot = await t.get(db.collection(collection.name).doc(id));
          return snapshot.exists ? ({ ...snapshot.data(), id: snapshot.id } as never) : null;
        },
        set: (collection, doc) => {
          t.set(db.collection(collection.name).doc(doc.id), stripUndefined(doc));
        },
        update: (collection, id, patch) => {
          t.set(db.collection(collection.name).doc(id), stripUndefined(patch) as never, {
            merge: true,
          });
        },
        remove: (collection, id) => {
          t.delete(db.collection(collection.name).doc(id));
        },
      };
      return handler(tx);
    });
  }
}
