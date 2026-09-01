import { env } from '../config/env';
import { DEFAULT_COMPANY } from '../domain/term';
import type {
  AdminProfile,
  AppSettings,
  Delivery,
  Employee,
  Material,
  StockMovement,
  StoredFile,
} from '../domain/types';
import { cachedCollection, invalidateAllCaches } from './cache';
import type { Datastore, Doc, Transaction } from './datastore';
import { FirestoreDatastore } from './firestore-datastore';
import { LocalDatastore } from './local-datastore';

const base: Datastore =
  env.dataDriver === 'firestore' ? new FirestoreDatastore() : new LocalDatastore();

/**
 * Transações escrevem direto no banco, sem passar pelos wrappers de cache.
 * Depois de confirmar, descartamos os retratos para não servir saldo velho —
 * é a baixa de estoque que mais depende disso.
 */
export const datastore: Datastore = {
  driver: base.driver,
  collection: (name) => base.collection(name),
  async runTransaction<R>(handler: (tx: Transaction) => Promise<R>): Promise<R> {
    try {
      return await base.runTransaction(handler);
    } finally {
      invalidateAllCaches();
    }
  },
};

/** Quanto tempo cada retrato vale. Coleções que crescem não entram no cache. */
const TTL = {
  /** Muda quando o admin edita as configurações — raro. */
  settings: 10 * 60_000,
  /** Catálogo e pessoas mudam por ação do admin, sempre invalidando o cache. */
  reference: 5 * 60_000,
};

export const collections = {
  materials: cachedCollection(base.collection<Material>('materials'), TTL.reference),
  employees: cachedCollection(base.collection<Employee>('employees'), TTL.reference),
  settings: cachedCollection(base.collection<AppSettings>('settings'), TTL.settings),
  admins: cachedCollection(base.collection<AdminProfile>('admins'), TTL.settings),

  // Sem cache: crescem sem teto e mudam a cada assinatura.
  deliveries: base.collection<Delivery>('deliveries'),
  movements: base.collection<StockMovement>('stock_movements'),
  files: base.collection<StoredFile>('files'),
};

/**
 * Coleções sem cache, para contagens.
 *
 * `count()` no Firestore custa uma leitura; pelo cache, custaria carregar a
 * coleção inteira. Quem só quer um número — o painel mostrando "109
 * colaboradores" — deve passar por aqui e não aquecer cache à toa.
 */
export const aggregates = {
  employees: base.collection<Employee>('employees'),
  deliveries: base.collection<Delivery>('deliveries'),
};

export const SETTINGS_ID = 'app';

const defaultSettings = (): AppSettings => ({
  id: SETTINGS_ID,
  company: { ...DEFAULT_COMPANY },
  lowStockThreshold: env.lowStockThreshold,
  slackAdminChannel: env.slack.adminChannel || undefined,
  updatedAt: new Date().toISOString(),
});

/**
 * Configuração da aplicação, criando o documento padrão na primeira leitura.
 * Chamada por quase toda requisição — daí valer o cache mais longo.
 */
export async function getSettings(): Promise<AppSettings> {
  const existing = await collections.settings.get(SETTINGS_ID);
  if (existing) return { ...defaultSettings(), ...existing, id: SETTINGS_ID };
  const created = defaultSettings();
  await collections.settings.set(created);
  return created;
}

export { invalidateAllCaches } from './cache';
export { type Datastore } from './datastore';
export type { Doc };
