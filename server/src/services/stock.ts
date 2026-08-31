import { collections, datastore, getSettings } from '../data';
import type {
  AuthenticatedAdmin,
  Delivery,
  Material,
  MovementReason,
  StockMovement,
} from '../domain/types';
import { newId } from '../utils/ids';
import { notifier } from './notifications';

export interface StockChange {
  materialId: string;
  variantKey: string;
  /** Negativo = saída, positivo = entrada. */
  delta: number;
}

export interface StockResult {
  movements: StockMovement[];
  /** Preenchido quando o estoque não cobriu a saída integralmente. */
  warnings: string[];
  lowStock: Array<{ material: Material; variantKey: string; stock: number; threshold: number }>;
}

interface ApplyOptions {
  reason: MovementReason;
  actor: AuthenticatedAdmin;
  deliveryId?: string;
  note?: string;
  /** Saídas maiores que o saldo são limitadas a zero e viram aviso. */
  clampToZero?: boolean;
}

/**
 * Aplica um conjunto de variações de estoque em **uma transação** e registra
 * cada movimento em `stock_movements` (trilha de auditoria completa).
 *
 * Regra deliberada: uma assinatura nunca falha por falta de saldo — o termo é um
 * documento jurídico e precisa ser concluído. Quando o saldo não cobre a saída,
 * a baixa é limitada a zero e o aviso sobe para o painel do admin.
 */
export async function applyStockChanges(
  changes: StockChange[],
  options: ApplyOptions,
): Promise<StockResult> {
  if (!changes.length) return { movements: [], warnings: [], lowStock: [] };

  const settings = await getSettings();
  const now = new Date().toISOString();

  const result = await datastore.runTransaction<StockResult>(async (tx) => {
    // 1) todas as leituras antes de qualquer escrita (exigência do Firestore)
    const ids = [...new Set(changes.map((change) => change.materialId))];
    const materials = new Map<string, Material>();
    for (const id of ids) {
      const material = await tx.get(collections.materials, id);
      if (material) materials.set(id, material);
    }

    const movements: StockMovement[] = [];
    const warnings: string[] = [];
    const lowStock: StockResult['lowStock'] = [];

    // 2) cálculo em memória
    for (const change of changes) {
      const material = materials.get(change.materialId);
      if (!material) {
        warnings.push(`Material ${change.materialId} não encontrado — movimento ignorado.`);
        continue;
      }
      const variant = material.variants.find((v) => v.key === change.variantKey);
      if (!variant) {
        warnings.push(
          `Variante "${change.variantKey}" não existe mais em ${material.name} — movimento ignorado.`,
        );
        continue;
      }

      let delta = change.delta;
      if (options.clampToZero && delta < 0 && variant.stock + delta < 0) {
        warnings.push(
          `${material.name} (${material.variantLabel} ${variant.key}): saldo insuficiente — ` +
            `baixa de ${Math.abs(delta)} ajustada para ${variant.stock}.`,
        );
        delta = -variant.stock;
      }
      if (delta === 0) continue;

      variant.stock = Math.max(0, variant.stock + delta);
      material.updatedAt = now;

      movements.push({
        id: newId('mov_'),
        materialId: material.id,
        materialName: material.name,
        variantKey: variant.key,
        delta,
        stockAfter: variant.stock,
        reason: options.reason,
        deliveryId: options.deliveryId,
        note: options.note,
        actorUid: options.actor.uid,
        actorName: options.actor.name,
        at: now,
      });

      const threshold = variant.minStock ?? settings.lowStockThreshold;
      if (delta < 0 && variant.stock <= threshold) {
        lowStock.push({ material, variantKey: variant.key, stock: variant.stock, threshold });
      }
    }

    // 3) escritas
    for (const material of materials.values()) {
      tx.update(collections.materials, material.id, {
        variants: material.variants,
        updatedAt: now,
      });
    }
    for (const movement of movements) {
      tx.set(collections.movements, movement);
    }

    return { movements, warnings, lowStock };
  });

  // efeitos colaterais fora da transação
  for (const alert of result.lowStock) {
    void notifier.notifyLowStock({
      materialName: alert.material.name,
      variantKey: alert.variantKey,
      variantLabel: alert.material.variantLabel,
      stock: alert.stock,
      threshold: alert.threshold,
    });
  }

  return result;
}

/** Baixa automática disparada quando o colaborador assina o termo. */
export function deliveryStockOut(delivery: Delivery, actor: AuthenticatedAdmin): Promise<StockResult> {
  return applyStockChanges(
    delivery.items.map((item) => ({
      materialId: item.materialId,
      variantKey: item.variantKey,
      delta: -item.quantity,
    })),
    {
      reason: 'delivery_signed',
      actor,
      deliveryId: delivery.id,
      note: `Entrega assinada por ${delivery.employeeDraft.fullName}`,
      clampToZero: true,
    },
  );
}

/** Reentrada de estoque no registro de devolução. */
export function deliveryStockIn(
  delivery: Delivery,
  entries: Array<{ itemIndex: number; quantity: number }>,
  actor: AuthenticatedAdmin,
  note?: string,
): Promise<StockResult> {
  const changes: StockChange[] = [];
  for (const entry of entries) {
    const item = delivery.items[entry.itemIndex];
    if (!item) continue;
    changes.push({ materialId: item.materialId, variantKey: item.variantKey, delta: entry.quantity });
  }
  return applyStockChanges(changes, {
    reason: 'delivery_returned',
    actor,
    deliveryId: delivery.id,
    note: note ?? `Devolução de ${delivery.employeeDraft.fullName}`,
  });
}

/** Resumo usado no dashboard: totais e alertas de estoque baixo. */
export function summarizeStock(materials: Material[], threshold: number) {
  let totalUnits = 0;
  let variantCount = 0;
  const alerts: Array<{
    materialId: string;
    materialName: string;
    variantLabel: string;
    variantKey: string;
    stock: number;
    threshold: number;
  }> = [];

  for (const material of materials) {
    if (!material.active) continue;
    for (const variant of material.variants) {
      variantCount += 1;
      totalUnits += variant.stock;
      const limit = variant.minStock ?? threshold;
      if (variant.stock <= limit) {
        alerts.push({
          materialId: material.id,
          materialName: material.name,
          variantLabel: material.variantLabel,
          variantKey: variant.key,
          stock: variant.stock,
          threshold: limit,
        });
      }
    }
  }

  alerts.sort((a, b) => a.stock - b.stock);
  return {
    materialCount: materials.filter((m) => m.active).length,
    variantCount,
    totalUnits,
    alerts,
  };
}
