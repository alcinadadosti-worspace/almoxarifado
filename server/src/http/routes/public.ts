import { Router } from 'express';
import { acceptSignSchema } from '../../domain/schemas';
import {
  TERM_RESPONSIBILITY_TEXT,
  TERM_SECTIONS,
  TERM_TITLE,
  termIntro,
  termPlaceAndDate,
} from '../../domain/term';
import { findByToken, publicView, signByEmployee } from '../../services/deliveries';
import { clientIp } from '../auth';
import { asyncRoute } from '../errors';
import { rateLimit } from '../rate-limit';

/**
 * Superfície pública consumida por `/aceite/:token`.
 * Devolve **apenas** o necessário para exibir e assinar o termo — nunca o
 * documento completo da entrega, nunca dados de outros colaboradores.
 */
export const publicRouter = Router();

publicRouter.use(rateLimit({ windowMs: 60_000, max: 60, key: 'public' }));

publicRouter.get(
  '/deliveries/:token',
  asyncRoute(async (req, res) => {
    const delivery = await findByToken(req.params.token);
    const view = await publicView(delivery);
    res.json({
      delivery: view,
      term: {
        title: TERM_TITLE,
        sections: TERM_SECTIONS,
        intro: termIntro(view.company),
        responsibility: TERM_RESPONSIBILITY_TEXT,
        placeAndDate: termPlaceAndDate(view.company, new Date()),
      },
    });
  }),
);

publicRouter.post(
  '/deliveries/:token/sign',
  rateLimit({ windowMs: 60_000, max: 10, key: 'sign' }),
  asyncRoute(async (req, res) => {
    const delivery = await findByToken(req.params.token);
    const input = acceptSignSchema.parse(req.body);

    const signed = await signByEmployee(delivery, input, {
      ip: clientIp(req),
      userAgent: String(req.headers['user-agent'] ?? '').slice(0, 400),
    });

    res.json({
      ok: true,
      delivery: await publicView(signed),
      signedAt: signed.employeeSignature?.signedAt,
    });
  }),
);
