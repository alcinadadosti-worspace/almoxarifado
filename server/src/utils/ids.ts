import crypto from 'node:crypto';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Id curto, ordenável por tempo (prefixo em base36 do epoch) + 8 aleatórios. */
export function newId(prefix = ''): string {
  const time = Date.now().toString(36);
  const bytes = crypto.randomBytes(6);
  let random = '';
  for (const byte of bytes) random += ALPHABET[byte % ALPHABET.length];
  return `${prefix}${time}${random}`;
}

/** Token do link de aceite: 256 bits, url-safe, impossível de adivinhar. */
export function newAcceptToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Comparação em tempo constante (tokens e assinaturas de URL). */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
