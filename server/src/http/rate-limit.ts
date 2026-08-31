import type { NextFunction, Request, Response } from 'express';
import { clientIp } from './auth';
import { HttpError } from './errors';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Limitador simples em memória — protege a rota pública de aceite contra
 * tentativa de adivinhação de token. Em várias instâncias, troque por Redis.
 */
export function rateLimit(options: { windowMs: number; max: number; key?: string }) {
  const buckets = new Map<string, Bucket>();

  return (req: Request, _res: Response, next: NextFunction): void => {
    const now = Date.now();
    const identity = `${options.key ?? 'default'}:${clientIp(req)}`;
    const bucket = buckets.get(identity);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(identity, { count: 1, resetAt: now + options.windowMs });
    } else if (bucket.count >= options.max) {
      next(new HttpError(429, 'Muitas tentativas. Aguarde um instante.', 'rate_limited'));
      return;
    } else {
      bucket.count += 1;
    }

    // limpeza preguiçosa
    if (buckets.size > 5_000) {
      for (const [key, value] of buckets) if (value.resetAt <= now) buckets.delete(key);
    }
    next();
  };
}
