import { Router } from 'express';
import { aggregates, collections, getSettings } from '../../data';
import type { DeliveryStatus } from '../../domain/types';
import { deliveryDto } from '../../services/deliveries';
import { notificationStatus } from '../../services/notifications';
import { summarizeStock } from '../../services/stock';
import { requireAdmin } from '../auth';
import { asyncRoute } from '../errors';

export const dashboardRouter = Router();
dashboardRouter.use(requireAdmin);

/** Os únicos status que o painel mostra em número. */
const COUNTED_STATUSES: DeliveryStatus[] = ['draft', 'sent', 'signed_by_employee'];

/** Tudo que o painel inicial precisa em uma única chamada. */
dashboardRouter.get(
  '/',
  asyncRoute(async (_req, res) => {
    const settings = await getSettings();

    // Cada fila é uma consulta própria, com limite pequeno: derivar tudo de
    // uma lista "recente" esconderia uma pendência antiga atrás de entregas
    // novas já concluídas. Os totais vêm de agregações — uma leitura por
    // consulta, em vez de uma por documento.
    const [materials, pending, awaiting, recent, movements, employeeCount, ...statusCounts] =
      await Promise.all([
        collections.materials.list({ orderBy: ['name', 'asc'] }),
        collections.deliveries.list({
          where: [['status', '==', 'signed_by_employee']],
          orderBy: ['createdAt', 'desc'],
          limit: 6,
        }),
        collections.deliveries.list({
          where: [['status', 'in', ['sent', 'draft']]],
          orderBy: ['createdAt', 'desc'],
          limit: 6,
        }),
        collections.deliveries.list({ orderBy: ['createdAt', 'desc'], limit: 8 }),
        collections.movements.list({ orderBy: ['at', 'desc'], limit: 8 }),
        aggregates.employees.count({ where: [['active', '==', true]] }),
        ...COUNTED_STATUSES.map((status) =>
          aggregates.deliveries.count({ where: [['status', '==', status]] }),
        ),
      ]);

    // Só contamos os status que o painel exibe; os demais ficam em zero e a
    // tela de Entregas, que os mostra, faz a própria contagem.
    const counts = {
      draft: 0,
      sent: 0,
      signed_by_employee: 0,
      countersigned: 0,
      archived: 0,
      returned: 0,
    } as Record<DeliveryStatus, number>;
    COUNTED_STATUSES.forEach((status, index) => {
      counts[status] = statusCounts[index];
    });

    res.json({
      company: settings.company,
      stock: summarizeStock(materials, settings.lowStockThreshold),
      deliveries: {
        counts,
        total: Object.values(counts).reduce((sum, value) => sum + value, 0),
        pendingCountersign: await Promise.all(pending.map((d) => deliveryDto(d))),
        awaitingEmployee: await Promise.all(awaiting.map((d) => deliveryDto(d))),
        recent: await Promise.all(recent.map((d) => deliveryDto(d))),
      },
      employees: { total: employeeCount },
      movements,
      notifications: notificationStatus(settings),
      lowStockThreshold: settings.lowStockThreshold,
    });
  }),
);
