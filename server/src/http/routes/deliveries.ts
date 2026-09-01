import { Router } from 'express';
import { aggregates, collections, getSettings } from '../../data';
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
import { matchesSearch } from '../../utils/search';
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
    const search = String(req.query.search ?? '').trim();
    const filtered = STATUSES.includes(status as DeliveryStatus) ? (status as DeliveryStatus) : null;

    // Os contadores das abas vêm de agregações (uma leitura cada) e a lista
    // já sai filtrada pelo banco. Antes, carregávamos a coleção inteira só
    // para contar e filtrar em memória — custo que crescia a cada entrega.
    const [deliveries, ...statusCounts] = await Promise.all([
      collections.deliveries.list({
        where: filtered ? [['status', '==', filtered]] : undefined,
        orderBy: ['createdAt', 'desc'],
        limit: search ? 200 : 60,
      }),
      ...STATUSES.map((value) => aggregates.deliveries.count({ where: [['status', '==', value]] })),
    ]);

    const counts = Object.fromEntries(
      STATUSES.map((value, index) => [value, statusCounts[index]]),
    ) as Record<DeliveryStatus, number>;
    const visible = search
      ? deliveries.filter((delivery) =>
          matchesSearch(
            search,
            delivery.employeeDraft.fullName,
            delivery.employeeDraft.sector,
            delivery.employeeDraft.role,
            delivery.items.map((item) => item.name).join(' '),
          ),
        )
      : deliveries;

    res.json({
      deliveries: await Promise.all(visible.slice(0, 60).map((d) => deliveryDto(d))),
      counts,
      total: filtered
        ? counts[filtered]
        : Object.values(counts).reduce((sum, value) => sum + value, 0),
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
