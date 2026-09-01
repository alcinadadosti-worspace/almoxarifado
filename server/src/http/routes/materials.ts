import { Router } from 'express';
import { collections, getSettings } from '../../data';
import { materialInputSchema, stockAdjustmentSchema } from '../../domain/schemas';
import type { Material } from '../../domain/types';
import { applyStockChanges, summarizeStock } from '../../services/stock';
import { newId } from '../../utils/ids';
import { currentAdmin, requireAdmin } from '../auth';
import { HttpError, asyncRoute } from '../errors';

export const materialsRouter = Router();
materialsRouter.use(requireAdmin);

const withTotals = (material: Material, threshold: number) => {
  const totalStock = material.variants.reduce((sum, variant) => sum + variant.stock, 0);
  return {
    ...material,
    totalStock,
    lowStockVariants: material.variants
      .filter((variant) => variant.stock <= (variant.minStock ?? threshold))
      .map((variant) => variant.key),
  };
};

materialsRouter.get(
  '/',
  asyncRoute(async (req, res) => {
    const settings = await getSettings();
    const includeInactive = req.query.includeInactive === 'true';
    const search = String(req.query.search ?? '').trim().toLowerCase();
    const category = String(req.query.category ?? '').trim();

    let materials = await collections.materials.list({ orderBy: ['name', 'asc'] });
    if (!includeInactive) materials = materials.filter((material) => material.active);
    if (category) materials = materials.filter((material) => material.category === category);
    if (search) {
      materials = materials.filter((material) =>
        [material.name, material.brand, material.model, material.category]
          .join(' ')
          .toLowerCase()
          .includes(search),
      );
    }

    res.json({
      materials: materials.map((material) => withTotals(material, settings.lowStockThreshold)),
      categories: [...new Set(materials.map((material) => material.category).filter(Boolean))].sort(),
      summary: summarizeStock(materials, settings.lowStockThreshold),
      lowStockThreshold: settings.lowStockThreshold,
    });
  }),
);

materialsRouter.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const settings = await getSettings();
    const material = await collections.materials.get(req.params.id);
    if (!material) throw HttpError.notFound('Material não encontrado.');

    const movements = await collections.movements.list({
      where: [['materialId', '==', material.id]],
      orderBy: ['at', 'desc'],
      limit: 40,
    });

    res.json({ material: withTotals(material, settings.lowStockThreshold), movements });
  }),
);

materialsRouter.post(
  '/',
  asyncRoute(async (req, res) => {
    const admin = currentAdmin(req);
    const input = materialInputSchema.parse(req.body);
    const now = new Date().toISOString();

    // O material nasce zerado e o saldo inicial entra como movimento, para que
    // toda unidade em estoque tenha origem rastreável em `stock_movements`.
    const material: Material = {
      id: newId('mat_'),
      ...input,
      variants: input.variants.map((variant) => ({ ...variant, stock: 0 })),
      createdAt: now,
      updatedAt: now,
    };
    await collections.materials.set(material);

    const initial = input.variants.filter((variant) => variant.stock > 0);
    if (initial.length) {
      await applyStockChanges(
        initial.map((variant) => ({
          materialId: material.id,
          variantKey: variant.key,
          delta: variant.stock,
        })),
        { reason: 'material_created', actor: admin, note: 'Estoque inicial do cadastro' },
      );
    }

    res.status(201).json({ material: (await collections.materials.get(material.id)) ?? material });
  }),
);

materialsRouter.put(
  '/:id',
  asyncRoute(async (req, res) => {
    const admin = currentAdmin(req);
    const existing = await collections.materials.get(req.params.id);
    if (!existing) throw HttpError.notFound('Material não encontrado.');
    const input = materialInputSchema.parse(req.body);

    // O saldo das variantes já existentes é preservado: estoque só muda por
    // movimento auditado (`/adjust`, entrega ou devolução). Variantes novas
    // entram zeradas e recebem o saldo informado como movimento de entrada.
    const currentStock = new Map(existing.variants.map((variant) => [variant.key, variant.stock]));
    const material: Material = {
      ...existing,
      ...input,
      variants: input.variants.map((variant) => ({
        ...variant,
        stock: currentStock.get(variant.key) ?? 0,
      })),
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    await collections.materials.set(material);

    // Variante removida com saldo: o saldo não pode simplesmente evaporar da
    // auditoria. Registramos a saída para que a soma dos movimentos continue
    // batendo com o que existe no estoque.
    const keptKeys = new Set(input.variants.map((variant) => variant.key));
    const removedWithStock = existing.variants.filter(
      (variant) => !keptKeys.has(variant.key) && variant.stock > 0,
    );
    const now = new Date().toISOString();
    for (const variant of removedWithStock) {
      await collections.movements.set({
        id: newId('mov_'),
        materialId: material.id,
        materialName: material.name,
        variantKey: variant.key,
        delta: -variant.stock,
        stockAfter: 0,
        reason: 'manual_adjustment',
        note: `Variante "${variant.key}" removida do cadastro (saldo de ${variant.stock} baixado)`,
        actorUid: admin.uid,
        actorName: admin.name,
        at: now,
      });
    }

    const added = input.variants.filter(
      (variant) => !currentStock.has(variant.key) && variant.stock > 0,
    );
    if (added.length) {
      await applyStockChanges(
        added.map((variant) => ({
          materialId: material.id,
          variantKey: variant.key,
          delta: variant.stock,
        })),
        { reason: 'material_created', actor: admin, note: 'Nova variante cadastrada' },
      );
    }

    res.json({ material: (await collections.materials.get(material.id)) ?? material });
  }),
);

/** Ajuste manual de saldo (entrada de compra, perda, correção de inventário). */
materialsRouter.post(
  '/:id/adjust',
  asyncRoute(async (req, res) => {
    const admin = currentAdmin(req);
    const material = await collections.materials.get(req.params.id);
    if (!material) throw HttpError.notFound('Material não encontrado.');

    const input = stockAdjustmentSchema.parse(req.body);
    if (!material.variants.some((variant) => variant.key === input.variantKey)) {
      throw HttpError.badRequest(
        `A variante "${input.variantKey}" não existe em ${material.name}.`,
      );
    }

    const result = await applyStockChanges(
      [{ materialId: material.id, variantKey: input.variantKey, delta: input.delta }],
      { reason: 'manual_adjustment', actor: admin, note: input.note, clampToZero: true },
    );

    const updated = await collections.materials.get(material.id);
    res.json({ material: updated, movements: result.movements, warnings: result.warnings });
  }),
);

/** Desativação (soft delete) — o histórico de entregas precisa continuar íntegro. */
materialsRouter.delete(
  '/:id',
  asyncRoute(async (req, res) => {
    const material = await collections.materials.get(req.params.id);
    if (!material) throw HttpError.notFound('Material não encontrado.');
    await collections.materials.update(material.id, {
      active: false,
      updatedAt: new Date().toISOString(),
    });
    res.json({ ok: true });
  }),
);
