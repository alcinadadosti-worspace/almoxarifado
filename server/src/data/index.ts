import { env } from '../config/env';
import { DEFAULT_COMPANY } from '../domain/term';
import type {
  AdminProfile,
  AppSettings,
  Delivery,
  Employee,
  Material,
  StockMovement,
} from '../domain/types';
import type { Datastore } from './datastore';
import { FirestoreDatastore } from './firestore-datastore';
import { LocalDatastore } from './local-datastore';

export const datastore: Datastore =
  env.dataDriver === 'firestore' ? new FirestoreDatastore() : new LocalDatastore();

export const collections = {
  materials: datastore.collection<Material>('materials'),
  employees: datastore.collection<Employee>('employees'),
  deliveries: datastore.collection<Delivery>('deliveries'),
  movements: datastore.collection<StockMovement>('stock_movements'),
  settings: datastore.collection<AppSettings>('settings'),
  admins: datastore.collection<AdminProfile>('admins'),
};

export const SETTINGS_ID = 'app';

const defaultSettings = (): AppSettings => ({
  id: SETTINGS_ID,
  company: { ...DEFAULT_COMPANY },
  lowStockThreshold: env.lowStockThreshold,
  slackAdminChannel: env.slack.adminChannel || undefined,
  updatedAt: new Date().toISOString(),
});

/** Configuração da aplicação, criando o documento padrão na primeira leitura. */
export async function getSettings(): Promise<AppSettings> {
  const existing = await collections.settings.get(SETTINGS_ID);
  if (existing) return { ...defaultSettings(), ...existing, id: SETTINGS_ID };
  const created = defaultSettings();
  await collections.settings.set(created);
  return created;
}

export { type Datastore } from './datastore';
