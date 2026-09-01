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

    // Cada filtro tem seu índice composto com `at`; os dois juntos exigiriam
    // um terceiro índice. Consultamos por um e refinamos o outro em memória.
    const where: Array<[string, '==', unknown]> = [];
    if (deliveryId) where.push(['deliveryId', '==', deliveryId]);
    else if (materialId) where.push(['materialId', '==', materialId]);

    let movements = await collections.movements.list({
      where: where.length ? where : undefined,
      orderBy: ['at', 'desc'],
      limit: deliveryId && materialId ? 500 : limit,
    });
    if (deliveryId && materialId) {
      movements = movements.filter((movement) => movement.materialId === materialId).slice(0, limit);
    }

    res.json({ movements });
  }),
);
