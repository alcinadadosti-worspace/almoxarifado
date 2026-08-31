import { Router } from 'express';
import { collections } from '../../data';
import { requireAdmin } from '../auth';
import { asyncRoute } from '../errors';

export const movementsRouter = Router();
movementsRouter.use(requireAdmin);

/** Trilha de auditoria do estoque. */
movementsRouter.get(
  '/',
  asyncRoute(async (req, res) => {
    const materialId = String(req.query.materialId ?? '').trim();
    const deliveryId = String(req.query.deliveryId ?? '').trim();
    const limit = Math.min(Number(req.query.limit ?? 100) || 100, 500);

    const where: Array<[string, '==', unknown]> = [];
    if (materialId) where.push(['materialId', '==', materialId]);
    if (deliveryId) where.push(['deliveryId', '==', deliveryId]);

    const movements = await collections.movements.list({
      where: where.length ? where : undefined,
      orderBy: ['at', 'desc'],
      limit,
    });

    res.json({ movements });
  }),
);
