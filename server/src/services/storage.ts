import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env';
import { collections } from '../data';
import { safeEqual } from '../utils/ids';

/**
 * Armazenamento de arquivos sensíveis (assinaturas PNG e termos em PDF).
 *
 * Três implementações, mesma interface:
 *
 *  - `firestore` (padrão em produção) — grava no próprio banco. Os arquivos
 *    deste sistema são pequenos (dezenas de KB), cabem com folga no limite de
 *    1 MiB por documento e dispensam o Firebase Storage, que exige plano pago.
 *  - `firebase` — Cloud Storage, usado quando há um bucket configurado.
 *  - `local` — disco, apenas para desenvolvimento sem Firebase.
 *
 * Nada é público em nenhuma delas: o acesso acontece sempre por **URL assinada
 * com expiração** — `getSignedUrl` no Cloud Storage, e a rota `/api/files/...`
 * protegida por HMAC nas demais.
 */

export interface StoredObject {
  buffer: Buffer;
  contentType: string;
}

export type StorageDriver = 'firebase' | 'firestore' | 'local';

export interface StorageService {
  readonly driver: StorageDriver;
  save(objectPath: string, buffer: Buffer, contentType: string): Promise<string>;
  read(objectPath: string): Promise<StoredObject | null>;
  exists(objectPath: string): Promise<boolean>;
  signedUrl(objectPath: string, ttlMinutes?: number): Promise<string>;
}

/** Limite de segurança: o documento do Firestore aceita 1 MiB e o base64 infla ~33%. */
const MAX_FILE_BYTES = 700 * 1024;

/* ----------------------------------------------------- URL assinada local */

const FILES_ROUTE = '/api/files';

export function signLocalUrl(objectPath: string, ttlMinutes: number): string {
  const expires = Date.now() + ttlMinutes * 60_000;
  const signature = crypto
    .createHmac('sha256', env.fileSigningSecret)
    .update(`${objectPath}|${expires}`)
    .digest('hex');
  const encoded = objectPath.split('/').map(encodeURIComponent).join('/');
  return `${env.apiBaseUrl}${FILES_ROUTE}/${encoded}?exp=${expires}&sig=${signature}`;
}

export function verifyLocalUrl(objectPath: string, expires: string, signature: string): boolean {
  const expiresAt = Number(expires);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const expected = crypto
    .createHmac('sha256', env.fileSigningSecret)
    .update(`${objectPath}|${expiresAt}`)
    .digest('hex');
  return safeEqual(expected, signature);
}

/* ------------------------------------------------- driver: banco de dados */

/**
 * Guarda o arquivo como documento na coleção `files`. Funciona igual sobre o
 * Firestore e sobre o driver local, porque conversa com a camada de dados —
 * o que também torna este caminho testável sem nenhuma credencial.
 */
class DatastoreStorage implements StorageService {
  readonly driver = 'firestore' as const;

  /** ID determinístico e seguro (o caminho tem barras, que o Firestore recusa). */
  private idFor(objectPath: string): string {
    return crypto.createHash('sha256').update(objectPath).digest('hex').slice(0, 40);
  }

  async save(objectPath: string, buffer: Buffer, contentType: string): Promise<string> {
    if (buffer.length > MAX_FILE_BYTES) {
      throw new Error(
        `Arquivo de ${Math.round(buffer.length / 1024)} kB excede o limite de ` +
          `${Math.round(MAX_FILE_BYTES / 1024)} kB por documento. ` +
          'Configure FIREBASE_STORAGE_BUCKET para usar o Cloud Storage.',
      );
    }

    await collections.files.set({
      id: this.idFor(objectPath),
      path: objectPath,
      contentType,
      size: buffer.length,
      data: buffer.toString('base64'),
      updatedAt: new Date().toISOString(),
    });
    return objectPath;
  }

  async read(objectPath: string): Promise<StoredObject | null> {
    const doc = await collections.files.get(this.idFor(objectPath));
    if (!doc) return null;
    return { buffer: Buffer.from(doc.data, 'base64'), contentType: doc.contentType };
  }

  async exists(objectPath: string): Promise<boolean> {
    return Boolean(await collections.files.get(this.idFor(objectPath)));
  }

  async signedUrl(objectPath: string, ttlMinutes = env.signedUrlTtlMinutes): Promise<string> {
    return signLocalUrl(objectPath, ttlMinutes);
  }
}

/* ------------------------------------------------------------ driver local */

class LocalStorage implements StorageService {
  readonly driver = 'local' as const;
  private readonly root = path.join(env.dataDir, 'files');

  private resolve(objectPath: string): string {
    const normalized = path
      .normalize(objectPath)
      .replace(/^([/\\])+/, '')
      .replace(/\\/g, '/');
    if (normalized.includes('..')) throw new Error('Caminho de arquivo inválido.');
    return path.join(this.root, normalized);
  }

  async save(objectPath: string, buffer: Buffer, contentType: string): Promise<string> {
    const file = this.resolve(objectPath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buffer);
    fs.writeFileSync(`${file}.meta`, JSON.stringify({ contentType }), 'utf8');
    return objectPath;
  }

  async read(objectPath: string): Promise<StoredObject | null> {
    const file = this.resolve(objectPath);
    if (!fs.existsSync(file)) return null;
    let contentType = 'application/octet-stream';
    try {
      contentType = JSON.parse(fs.readFileSync(`${file}.meta`, 'utf8')).contentType ?? contentType;
    } catch {
      /* metadados ausentes — segue com o tipo genérico */
    }
    return { buffer: fs.readFileSync(file), contentType };
  }

  async exists(objectPath: string): Promise<boolean> {
    return fs.existsSync(this.resolve(objectPath));
  }

  async signedUrl(objectPath: string, ttlMinutes = env.signedUrlTtlMinutes): Promise<string> {
    return signLocalUrl(objectPath, ttlMinutes);
  }
}

/* --------------------------------------------------------- Firebase Storage */

class FirebaseStorage implements StorageService {
  readonly driver = 'firebase' as const;

  private async file(objectPath: string) {
    const { getBucket } = await import('../data/firebase');
    return getBucket().file(objectPath);
  }

  async save(objectPath: string, buffer: Buffer, contentType: string): Promise<string> {
    const file = await this.file(objectPath);
    await file.save(buffer, {
      contentType,
      resumable: false,
      metadata: {
        contentType,
        cacheControl: 'private, max-age=0, no-store',
        metadata: { app: 'acqua-almoxarifado' },
      },
    });
    return objectPath;
  }

  async read(objectPath: string): Promise<StoredObject | null> {
    const file = await this.file(objectPath);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [buffer] = await file.download();
    const [metadata] = await file.getMetadata();
    return { buffer, contentType: String(metadata.contentType ?? 'application/octet-stream') };
  }

  async exists(objectPath: string): Promise<boolean> {
    const file = await this.file(objectPath);
    const [exists] = await file.exists();
    return exists;
  }

  async signedUrl(objectPath: string, ttlMinutes = env.signedUrlTtlMinutes): Promise<string> {
    try {
      const file = await this.file(objectPath);
      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + ttlMinutes * 60_000,
      });
      return url;
    } catch (error) {
      // Sem chave privada para assinar (emulador/ADC): usa a rota interna.
      console.warn('[storage] getSignedUrl indisponível, usando proxy assinado local.', error);
      return signLocalUrl(objectPath, ttlMinutes);
    }
  }
}

/* ----------------------------------------------------- escolha do driver */

function pickDriver(): StorageDriver {
  if (env.storageDriver !== 'auto') return env.storageDriver;
  if (env.dataDriver !== 'firestore') return 'local';
  // Com Firebase configurado: Cloud Storage só quando existe um bucket;
  // caso contrário, os arquivos ficam no próprio Firestore.
  return env.firebase.storageBucket ? 'firebase' : 'firestore';
}

const driver = pickDriver();

export const storage: StorageService =
  driver === 'firebase'
    ? new FirebaseStorage()
    : driver === 'firestore'
      ? new DatastoreStorage()
      : new LocalStorage();

/* --------------------------------------------------------------- helpers */

const DATA_URL_RE = /^data:(image\/(?:png|jpeg));base64,(.+)$/s;

export function decodeDataUrl(dataUrl: string): { buffer: Buffer; contentType: string } {
  const match = DATA_URL_RE.exec(dataUrl.replace(/\s+/g, ''));
  if (!match) throw new Error('Imagem inválida.');
  return { buffer: Buffer.from(match[2], 'base64'), contentType: match[1] };
}

export const storagePaths = {
  employeeSignature: (deliveryId: string) => `signatures/deliveries/${deliveryId}/employee.png`,
  adminSignature: (deliveryId: string) => `signatures/deliveries/${deliveryId}/admin.png`,
  savedAdminSignature: (uid: string) => `signatures/admins/${uid}.png`,
  term: (deliveryId: string) => `terms/${deliveryId}/termo-de-responsabilidade.pdf`,
};
