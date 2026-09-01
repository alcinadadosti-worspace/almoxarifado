import { Router } from 'express';
import { collections, getSettings } from '../../data';
import {
  countersignSchema,
  deliveryInputSchema,
  deliveryReturnSchema,
  deliverySendSchema,
} from '../../domain/schemas';
import type { DeliveryStatus } from '../../domain/types';
import {
  archiveDelivery,
  countersign,
  createDelivery,
  deliveryDto,
  generateTermPdf,
  registerReturn,
  sendDelivery,
} from '../../services/deliveries';
import { notificationStatus } from '../../services/notifications';
import { storage } from '../../services/storage';
import { currentAdmin, requireAdmin } from '../auth';
import { HttpError, asyncRoute } from '../errors';

export const deliveriesRouter = Router();
deliveriesRouter.use(requireAdmin);

const STATUSES: DeliveryStatus[] = [
  'draft',
  'sent',
  'signed_by_employee',
  'countersigned',
  'archived',
  'returned',
];

async function load(id: string) {
  const delivery = await collections.deliveries.get(id);
  if (!delivery) throw HttpError.notFound('Entrega não encontrada.');
  return delivery;
}

/** Fila de assinaturas: lista + contadores por status. */
deliveriesRouter.get(
  '/',
  asyncRoute(async (req, res) => {
    const status = String(req.query.status ?? '').trim();
    const search = String(req.query.search ?? '').trim().toLowerCase();

    let deliveries = await collections.deliveries.list({ orderBy: ['createdAt', 'desc'] });
    const counts = Object.fromEntries(STATUSES.map((value) => [value, 0])) as Record<
      DeliveryStatus,
      number
    >;
    for (const delivery of deliveries) counts[delivery.status] = (counts[delivery.status] ?? 0) + 1;

    if (status && STATUSES.includes(status as DeliveryStatus)) {
      deliveries = deliveries.filter((delivery) => delivery.status === status);
    }
    if (search) {
      deliveries = deliveries.filter((delivery) =>
        [delivery.employeeDraft.fullName, delivery.employeeDraft.sector, delivery.employeeDraft.role]
          .concat(delivery.items.map((item) => item.name))
          .join(' ')
          .toLowerCase()
          .includes(search),
      );
    }

    res.json({
      deliveries: await Promise.all(deliveries.slice(0, 200).map((d) => deliveryDto(d))),
      counts,
      total: deliveries.length,
      notifications: notificationStatus(await getSettings()),
    });
  }),
);

deliveriesRouter.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const delivery = await load(req.params.id);
    res.json({
      delivery: await deliveryDto(delivery, { withUrls: true }),
      notifications: notificationStatus(await getSettings()),
    });
  }),
);

deliveriesRouter.post(
  '/',
  asyncRoute(async (req, res) => {
    const admin = currentAdmin(req);
    const input = deliveryInputSchema.parse(req.body);
    const delivery = await createDelivery(input, admin);

    if (input.sendNow) {
      const result = await sendDelivery(delivery, input.slackTarget);
      res.status(201).json({
        delivery: await deliveryDto(result.delivery, { withUrls: true }),
        acceptUrl: result.acceptUrl,
        notification: result.notification,
      });
      return;
    }

    res.status(201).json({
      delivery: await deliveryDto(delivery, { withUrls: true }),
      acceptUrl: (await deliveryDto(delivery)).acceptUrl,
      notification: { ok: false, reason: 'not_sent' },
    });
  }),
);

/** Dispara (ou repete) o envio do link — Slack quando houver, link sempre. */
deliveriesRouter.post(
  '/:id/send',
  asyncRoute(async (req, res) => {
    const delivery = await load(req.params.id);
    const input = deliverySendSchema.parse(req.body ?? {});
    const result = await sendDelivery(delivery, input.slackTarget);
    res.json({
      delivery: await deliveryDto(result.delivery, { withUrls: true }),
      acceptUrl: result.acceptUrl,
      notification: result.notification,
    });
  }),
);

deliveriesRouter.post(
  '/:id/countersign',
  asyncRoute(async (req, res) => {
    const admin = currentAdmin(req);
    const delivery = await load(req.params.id);
    const input = countersignSchema.parse(req.body ?? {});
    const updated = await countersign(delivery, input, admin);
    res.json({ delivery: await deliveryDto(updated, { withUrls: true }) });
  }),
);

deliveriesRouter.post(
  '/:id/return',
  asyncRoute(async (req, res) => {
    const admin = currentAdmin(req);
    const delivery = await load(req.params.id);
    const input = deliveryReturnSchema.parse(req.body);
    const updated = await registerReturn(delivery, input, admin);
    res.json({ delivery: await deliveryDto(updated, { withUrls: true }) });
  }),
);

deliveriesRouter.post(
  '/:id/archive',
  asyncRoute(async (req, res) => {
    const delivery = await load(req.params.id);
    const updated = await archiveDelivery(delivery);
    res.json({ delivery: await deliveryDto(updated, { withUrls: true }) });
  }),
);

/** URL assinada do PDF (regenera o arquivo se ainda não existir). */
deliveriesRouter.get(
  '/:id/pdf',
  asyncRoute(async (req, res) => {
    const delivery = await load(req.params.id);
    if (delivery.status === 'draft' || delivery.status === 'sent') {
      throw HttpError.conflict('O termo ainda não foi assinado pelo colaborador.', 'not_signed');
    }
    if (!delivery.pdfPath || !(await storage.exists(delivery.pdfPath))) {
      await generateTermPdf(delivery);
      await collections.deliveries.set(delivery);
    }
    res.json({ url: await storage.signedUrl(delivery.pdfPath!), expiresInMinutes: 15 });
  }),
);
