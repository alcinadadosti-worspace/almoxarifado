import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import type { AuthenticatedAdmin } from '../domain/types';
import { HttpError } from './errors';
import { safeEqual } from '../utils/ids';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AuthenticatedAdmin;
    }
  }
}

/* ------------------------------------------------------- token de dev */

interface DevPayload {
  uid: string;
  email: string;
  name: string;
  exp: number;
}

const DEV_PREFIX = 'dev.';

/**
 * Sessão de desenvolvimento assinada por HMAC — permite demonstrar a aplicação
 * sem um projeto Firebase. Bloqueada por `ALLOW_DEV_AUTH` e por `NODE_ENV`.
 */
export function createDevToken(profile: Omit<DevPayload, 'exp'>, ttlHours = 12): string {
  const payload: DevPayload = { ...profile, exp: Date.now() + ttlHours * 3_600_000 };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', env.fileSigningSecret)
    .update(body)
    .digest('base64url');
  return `${DEV_PREFIX}${body}.${signature}`;
}

function verifyDevToken(token: string): AuthenticatedAdmin | null {
  if (!token.startsWith(DEV_PREFIX)) return null;
  const [body, signature] = token.slice(DEV_PREFIX.length).split('.');
  if (!body || !signature) return null;

  const expected = crypto
    .createHmac('sha256', env.fileSigningSecret)
    .update(body)
    .digest('base64url');
  if (!safeEqual(expected, signature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as DevPayload;
    if (payload.exp < Date.now()) return null;
    return { uid: payload.uid, email: payload.email, name: payload.name, dev: true };
  } catch {
    return null;
  }
}

/* --------------------------------------------------------- middleware */

function bearer(req: Request): string | null {
  const header = req.headers.authorization ?? '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  return header.slice(7).trim() || null;
}

function assertAllowedEmail(email: string): void {
  if (!env.adminEmails.length) return;
  if (!env.adminEmails.includes(email.toLowerCase())) {
    throw HttpError.forbidden('Esta conta não tem acesso ao painel do almoxarifado.');
  }
}

export async function authenticate(req: Request): Promise<AuthenticatedAdmin> {
  const token = bearer(req);
  if (!token) throw HttpError.unauthorized();

  if (env.allowDevAuth && !env.isProduction) {
    const dev = verifyDevToken(token);
    if (dev) return dev;
  }

  if (!env.firebase.available) {
    throw HttpError.unauthorized('Sessão inválida ou expirada.');
  }

  try {
    const { getAuth } = await import('../data/firebase');
    const decoded = await getAuth().verifyIdToken(token, true);
    const email = decoded.email ?? '';
    assertAllowedEmail(email);
    return {
      uid: decoded.uid,
      email,
      name: decoded.name ?? decoded.email ?? 'Representante da empresa',
      dev: false,
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw HttpError.unauthorized('Sessão inválida ou expirada.');
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  authenticate(req)
    .then((admin) => {
      req.admin = admin;
      next();
    })
    .catch(next);
}

export function currentAdmin(req: Request): AuthenticatedAdmin {
  if (!req.admin) throw HttpError.unauthorized();
  return req.admin;
}

/** IP real do cliente, respeitando proxies (evidência do aceite). */
export function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip ?? req.socket.remoteAddress ?? 'desconhecido';
}
