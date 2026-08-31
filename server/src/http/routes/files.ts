import { Router } from 'express';
import { storage, verifyLocalUrl } from '../../services/storage';
import { HttpError, asyncRoute } from '../errors';
import { rateLimit } from '../rate-limit';

/**
 * Entrega de arquivos sensíveis por URL assinada (HMAC + expiração).
 * Usado quando o Firebase Storage não consegue assinar sozinho (emulador,
 * ADC sem chave privada) e no driver local de desenvolvimento.
 */
export const filesRouter = Router();

filesRouter.get(
  '/*',
  rateLimit({ windowMs: 60_000, max: 120, key: 'files' }),
  asyncRoute(async (req, res) => {
    const objectPath = decodeURIComponent(String(req.params[0] ?? ''));
    const expires = String(req.query.exp ?? '');
    const signature = String(req.query.sig ?? '');

    if (!objectPath || !expires || !signature) throw HttpError.forbidden('URL inválida.');
    if (!verifyLocalUrl(objectPath, expires, signature)) {
      throw HttpError.forbidden('URL expirada ou adulterada.');
    }

    const file = await storage.read(objectPath);
    if (!file) throw HttpError.notFound('Arquivo não encontrado.');

    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (file.contentType === 'application/pdf') {
      res.setHeader('Content-Disposition', 'inline; filename="termo-de-responsabilidade.pdf"');
    }
    res.send(file.buffer);
  }),
);
