import { Router } from 'express';
import { collections, getSettings } from '../../data';
import type { DeliveryStatus } from '../../domain/types';
import { deliveryDto } from '../../services/deliveries';
import { notificationStatus } from '../../services/notifications';
import { summarizeStock } from '../../services/stock';
import { requireAdmin } from '../auth';
import { asyncRoute } from '../errors';

export const dashboardRouter = Router();
dashboardRouter.use(requireAdmin);

/** Tudo que o painel inicial precisa em uma única chamada. */
dashboardRouter.get(
  '/',
  asyncRoute(async (_req, res) => {
    const settings = await getSettings();
    const [materials, deliveries, movements, employees] = await Promise.all([
      collections.materials.list({ orderBy: ['name', 'asc'] }),
      collections.deliveries.list({ orderBy: ['createdAt', 'desc'], limit: 300 }),
      collections.movements.list({ orderBy: ['at', 'desc'], limit: 12 }),
      collections.employees.list(),
    ]);

    const counts = {
      draft: 0,
      sent: 0,
      signed_by_employee: 0,
      countersigned: 0,
      archived: 0,
      returned: 0,
    } as Record<DeliveryStatus, number>;
    for (const delivery of deliveries) counts[delivery.status] += 1;

    const pending = deliveries
      .filter((delivery) => delivery.status === 'signed_by_employee')
      .slice(0, 6);
    const awaiting = deliveries
      .filter((delivery) => delivery.status === 'sent' || delivery.status === 'draft')
      .slice(0, 6);

    res.json({
      company: settings.company,
      stock: summarizeStock(materials, settings.lowStockThreshold),
      deliveries: {
        counts,
        total: deliveries.length,
        pendingCountersign: await Promise.all(pending.map((d) => deliveryDto(d))),
        awaitingEmployee: await Promise.all(awaiting.map((d) => deliveryDto(d))),
        recent: await Promise.all(deliveries.slice(0, 8).map((d) => deliveryDto(d))),
      },
      employees: {
        total: employees.filter((employee) => employee.active).length,
      },
      movements,
      notifications: notificationStatus(settings),
      lowStockThreshold: settings.lowStockThreshold,
    });
  }),
);
