import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const str = (key: string, fallback = ''): string => (process.env[key] ?? '').trim() || fallback;
const num = (key: string, fallback: number): number => {
  const raw = Number.parseInt(str(key), 10);
  return Number.isFinite(raw) ? raw : fallback;
};
const bool = (key: string, fallback = false): boolean => {
  const raw = str(key).toLowerCase();
  if (!raw) return fallback;
  return raw === '1' || raw === 'true' || raw === 'yes';
};
const list = (key: string): string[] =>
  str(key)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

/** Lê a credencial do Admin SDK de qualquer uma das formas suportadas. */
function readServiceAccount(): Record<string, unknown> | null {
  const inline = str('FIREBASE_SERVICE_ACCOUNT');
  if (inline) {
    try {
      const json = inline.trim().startsWith('{')
        ? inline
        : Buffer.from(inline, 'base64').toString('utf8');
      return JSON.parse(json);
    } catch {
      console.warn('[env] FIREBASE_SERVICE_ACCOUNT inválido — ignorando.');
    }
  }
  const filePath = str('FIREBASE_SERVICE_ACCOUNT_PATH');
  if (filePath) {
    const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    if (fs.existsSync(resolved)) {
      try {
        return JSON.parse(fs.readFileSync(resolved, 'utf8'));
      } catch {
        console.warn(`[env] Não foi possível ler ${resolved} — ignorando.`);
      }
    }
  }
  return null;
}

const serviceAccount = readServiceAccount();
const hasEmulator = Boolean(str('FIRESTORE_EMULATOR_HOST'));
const hasAdc = Boolean(str('GOOGLE_APPLICATION_CREDENTIALS'));
const projectId =
  str('FIREBASE_PROJECT_ID') ||
  (typeof serviceAccount?.project_id === 'string' ? (serviceAccount.project_id as string) : '');

const driverPreference = (str('DATA_DRIVER', 'auto') as 'auto' | 'firestore' | 'local') ?? 'auto';
const firebaseAvailable = Boolean(serviceAccount || hasAdc || (hasEmulator && projectId));
const dataDriver: 'firestore' | 'local' =
  driverPreference === 'firestore'
    ? 'firestore'
    : driverPreference === 'local'
      ? 'local'
      : firebaseAvailable
        ? 'firestore'
        : 'local';

export const env = {
  nodeEnv: str('NODE_ENV', 'development'),
  isProduction: str('NODE_ENV', 'development') === 'production',
  port: num('PORT', 4000),
  appBaseUrl: str('APP_BASE_URL', 'http://localhost:5173').replace(/\/+$/, ''),
  apiBaseUrl: str('API_BASE_URL', `http://localhost:${num('PORT', 4000)}`).replace(/\/+$/, ''),
  corsOrigins: list('CORS_ORIGINS').length
    ? list('CORS_ORIGINS')
    : ['http://localhost:5173', 'http://127.0.0.1:5173'],

  dataDriver,
  firebase: {
    available: firebaseAvailable,
    projectId,
    serviceAccount,
    storageBucket: str('FIREBASE_STORAGE_BUCKET', projectId ? `${projectId}.appspot.com` : ''),
    usingEmulator: hasEmulator,
  },

  adminEmails: list('ADMIN_EMAILS').map((e) => e.toLowerCase()),
  allowDevAuth: bool('ALLOW_DEV_AUTH', !firebaseAvailable),
  devAdmin: {
    email: str('DEV_ADMIN_EMAIL', 'logisticavdpenedo@cpalcina.com').toLowerCase(),
    password: str('DEV_ADMIN_PASSWORD', 'almoxarifado'),
    name: str('DEV_ADMIN_NAME', 'Administração — Grupo Alcina Maria'),
  },

  slack: {
    botToken: str('SLACK_BOT_TOKEN'),
    signingSecret: str('SLACK_SIGNING_SECRET'),
    adminChannel: str('SLACK_ADMIN_CHANNEL'),
    get configured() {
      return Boolean(this.botToken && this.signingSecret);
    },
  },

  fileSigningSecret: str('FILE_SIGNING_SECRET', 'dev-file-signing-secret'),
  acceptTokenTtlHours: num('ACCEPT_TOKEN_TTL_HOURS', 168),
  signedUrlTtlMinutes: num('SIGNED_URL_TTL_MINUTES', 15),
  lowStockThreshold: num('LOW_STOCK_THRESHOLD', 5),

  dataDir: path.resolve(process.cwd(), '.data'),
};

export type Env = typeof env;
