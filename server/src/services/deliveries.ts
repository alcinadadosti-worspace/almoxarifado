import { env } from '../config/env';
import { collections, datastore, getSettings } from '../data';
import type {
  AcceptSignInput,
  CountersignInput,
  DeliveryInput,
  DeliveryReturnInput,
} from '../domain/schemas';
import { itemDescription, itemQuantityLabel } from '../domain/term';
import type {
  AuthenticatedAdmin,
  Delivery,
  DeliveryItem,
  DeliveryStatus,
  Employee,
  EmployeeDraft,
  Material,
} from '../domain/types';
import { HttpError } from '../http/errors';
import { formatCpf, maskCpf } from '../utils/cpf';
import { newAcceptToken, newId } from '../utils/ids';
import { notifier } from './notifications';
import { buildTermPdf } from './pdf/term-pdf';
import {
  applyStockChangesWithin,
  emitLowStockAlerts,
  stockInChanges,
  stockOutChanges,
} from './stock';
import { decodeDataUrl, storage, storagePaths } from './storage';

/* -------------------------------------------------------------- helpers */

export const acceptUrlFor = (delivery: Delivery): string =>
  `${env.appBaseUrl}/aceite/${delivery.token}`;

export const reviewUrlFor = (delivery: Delivery): string =>
  `${env.appBaseUrl}/app/entregas/${delivery.id}`;

/** Abaixo disso não é uma assinatura — nem um ponto único sobrevive tão pequeno. */
const MIN_SIGNATURE_BYTES = 100;

const systemActor = (delivery: Delivery): AuthenticatedAdmin => ({
  uid: `colaborador:${delivery.id}`,
  email: '',
  name: delivery.employeeSignature?.fullName || delivery.employeeDraft.fullName || 'Colaborador(a)',
  dev: false,
});

function assertTransition(delivery: Delivery, allowed: DeliveryStatus[], action: string): void {
  if (!allowed.includes(delivery.status)) {
    throw HttpError.conflict(
      `Não é possível ${action}: a entrega está com status "${delivery.status}".`,
      'invalid_status',
    );
  }
}

const isExpired = (delivery: Delivery): boolean =>
  new Date(delivery.tokenExpiresAt).getTime() < Date.now();

/* ---------------------------------------------------- criação da entrega */

/** Congela os dados do catálogo no momento da entrega (snapshot imutável). */
async function buildItems(input: DeliveryInput['items']): Promise<DeliveryItem[]> {
  const items: DeliveryItem[] = [];
  const cache = new Map<string, Material | null>();

  for (const raw of input) {
    let material = cache.get(raw.materialId);
    if (material === undefined) {
      material = await collections.materials.get(raw.materialId);
      cache.set(raw.materialId, material);
    }
    if (!material) throw HttpError.badRequest(`Material ${raw.materialId} não encontrado.`);
    if (!material.active) {
      throw HttpError.badRequest(`${material.name} está inativo e não pode ser entregue.`);
    }

    const variant = material.variants.find((v) => v.key === raw.variantKey);
    if (!variant) {
      throw HttpError.badRequest(
        `A variante "${raw.variantKey}" não existe em ${material.name}.`,
      );
    }
    if (variant.stock < raw.quantity) {
      throw HttpError.conflict(
        `Estoque insuficiente de ${material.name} (${material.variantLabel} ${variant.key}): ` +
          `disponível ${variant.stock}, solicitado ${raw.quantity}.`,
        'insufficient_stock',
      );
    }

    const customValues: Record<string, string> = {};
    for (const field of material.customFields) {
      const value = raw.customValues?.[field.label] ?? field.defaultValue ?? '';
      if (String(value).trim()) customValues[field.label] = String(value).trim();
    }

    items.push({
      materialId: material.id,
      name: material.name,
      category: material.category,
      brand: raw.brand ?? material.brand,
      model: raw.model ?? material.model,
      variantLabel: material.variantLabel,
      variantKey: variant.key,
      quantity: raw.quantity,
      unit: material.unit,
      conservation: raw.conservation ?? material.conservationDefault,
      customValues,
      returnedQuantity: 0,
    });
  }

  return items;
}

async function resolveEmployee(
  input: DeliveryInput,
): Promise<{ employeeId?: string; draft: EmployeeDraft }> {
  if (input.employeeId) {
    const employee = await collections.employees.get(input.employeeId);
    if (!employee) throw HttpError.badRequest('Colaborador não encontrado.');
    return {
      employeeId: employee.id,
      draft: {
        fullName: employee.fullName,
        cpf: employee.cpf,
        role: employee.role,
        sector: employee.sector,
        slackUserId: input.employeeDraft?.slackUserId || employee.slackUserId,
        email: employee.email,
      },
    };
  }

  const draft = input.employeeDraft;
  return {
    draft: {
      fullName: draft?.fullName ?? '',
      cpf: draft?.cpf ?? '',
      role: draft?.role ?? '',
      sector: draft?.sector ?? '',
      slackUserId: draft?.slackUserId,
      email: draft?.email,
    },
  };
}

export async function createDelivery(
  input: DeliveryInput,
  actor: AuthenticatedAdmin,
): Promise<Delivery> {
  const items = await buildItems(input.items);
  const { employeeId, draft } = await resolveEmployee(input);
  const now = new Date();

  const delivery: Delivery = {
    id: newId('ent_'),
    token: newAcceptToken(),
    tokenExpiresAt: new Date(
      now.getTime() + env.acceptTokenTtlHours * 3_600_000,
    ).toISOString(),
    employeeId,
    employeeDraft: draft,
    items,
    status: 'draft',
    notes: input.notes,
    createdBy: actor.uid,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  await collections.deliveries.set(delivery);
  return delivery;
}

/* ------------------------------------------------------------ envio/link */

export interface SendResult {
  delivery: Delivery;
  acceptUrl: string;
  notification: { ok: boolean; channel?: string; reason?: string };
}

/**
 * Envia o convite pelo canal configurado. Sem Slack, apenas marca como
 * enviada — o admin copia o `acceptUrl` retornado.
 */
export async function sendDelivery(
  delivery: Delivery,
  slackTarget?: string,
): Promise<SendResult> {
  assertTransition(delivery, ['draft', 'sent'], 'reenviar o link');
  if (isExpired(delivery)) {
    throw HttpError.gone(
      'O link desta entrega expirou. Crie uma nova entrega para gerar um link válido.',
      'token_expired',
    );
  }

  const settings = await getSettings();
  const acceptUrl = acceptUrlFor(delivery);

  const notification = await notifier.sendDeliveryInvite({
    delivery,
    acceptUrl,
    company: settings.company,
    target: slackTarget || delivery.employeeDraft.slackUserId,
  });

  const patch: Partial<Delivery> = {
    status: 'sent',
    sentAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (notification.ok) {
    patch.slackChannel = notification.channel;
    patch.slackMessageTs = notification.messageTs;
  }

  await collections.deliveries.update(delivery.id, patch);
  return {
    delivery: { ...delivery, ...patch },
    acceptUrl,
    notification: {
      ok: notification.ok,
      channel: notification.channel,
      reason: notification.reason,
    },
  };
}

/* -------------------------------------------------------- página pública */

export async function findByToken(token: string): Promise<Delivery> {
  const delivery = await collections.deliveries.findOne({ where: [['token', '==', token]] });
  if (!delivery) throw HttpError.notFound('Link inválido ou já removido.');
  return delivery;
}

/** Payload da página `/aceite/:token` — o mínimo necessário, nada além. */
export async function publicView(delivery: Delivery) {
  const settings = await getSettings();
  const signed = delivery.status !== 'draft' && delivery.status !== 'sent';

  return {
    id: delivery.id,
    status: delivery.status,
    signed,
    expired: isExpired(delivery) && !signed,
    expiresAt: delivery.tokenExpiresAt,
    company: settings.company,
    employee: {
      fullName: delivery.employeeSignature?.fullName ?? delivery.employeeDraft.fullName ?? '',
      // O CPF só sai para pré-preencher o formulário. Depois de assinado a
      // página é apenas um resumo — e o link pode ter sido encaminhado.
      cpf: signed ? '' : (delivery.employeeDraft.cpf ?? ''),
      role: delivery.employeeDraft.role ?? '',
      sector: delivery.employeeDraft.sector ?? '',
    },
    items: delivery.items.map((item, index) => ({
      index,
      name: item.name,
      description: itemDescription(item),
      brand: item.brand,
      model: item.model,
      variantLabel: item.variantLabel,
      variantKey: item.variantKey,
      quantity: item.quantity,
      unit: item.unit,
      quantityLabel: itemQuantityLabel(item),
      conservation: item.conservation,
      customValues: item.customValues,
    })),
    signedAt: delivery.employeeSignature?.signedAt ?? null,
    createdAt: delivery.createdAt,
  };
}

export interface SignContext {
  ip?: string;
  userAgent?: string;
}

/**
 * Assinatura do colaborador.
 *
 * Status, baixa de estoque e trilha de auditoria mudam numa **única
 * transação**: dois toques no botão, ou dois aparelhos com o mesmo link, não
 * conseguem assinar duas vezes nem baixar o estoque em dobro — o segundo
 * encontra a entrega já assinada e recebe 409.
 */
export async function signByEmployee(
  delivery: Delivery,
  input: AcceptSignInput,
  context: SignContext,
): Promise<Delivery> {
  // Pré-checagens fora da transação, para mensagens claras e sem custo.
  if (delivery.status !== 'draft' && delivery.status !== 'sent') {
    throw HttpError.conflict('Este termo já foi assinado.', 'already_signed');
  }
  if (isExpired(delivery)) {
    throw HttpError.gone('O link de assinatura expirou. Solicite um novo ao almoxarifado.', 'token_expired');
  }

  const { buffer, contentType } = decodeDataUrl(input.signature);
  if (buffer.length < MIN_SIGNATURE_BYTES) throw HttpError.badRequest('A assinatura está em branco.');

  // O caminho é determinístico; gravar antes garante que, quando o documento
  // disser que a imagem existe, ela exista. Se a transação falhar por corrida,
  // sobra um arquivo órfão inofensivo.
  const signaturePath = storagePaths.employeeSignature(delivery.id);
  await storage.save(signaturePath, buffer, contentType);

  const settings = await getSettings();
  const now = new Date();
  const actor = systemActor({ ...delivery, employeeDraft: { ...delivery.employeeDraft, fullName: input.fullName } });

  const { signed, stock } = await datastore.runTransaction(async (tx) => {
    // leituras primeiro: a entrega, depois os materiais (dentro do helper)
    const fresh = await tx.get(collections.deliveries, delivery.id);
    if (!fresh) throw HttpError.notFound('Link inválido ou já removido.');
    if (fresh.status !== 'draft' && fresh.status !== 'sent') {
      throw HttpError.conflict('Este termo já foi assinado.', 'already_signed');
    }
    if (isExpired(fresh)) {
      throw HttpError.gone('O link de assinatura expirou. Solicite um novo ao almoxarifado.', 'token_expired');
    }

    const stockResult = await applyStockChangesWithin(
      tx,
      stockOutChanges(fresh),
      {
        reason: 'delivery_signed',
        actor,
        deliveryId: fresh.id,
        note: `Entrega assinada por ${input.fullName}`,
        clampToZero: true,
      },
      settings,
    );

    const next: Delivery = {
      ...fresh,
      status: 'signed_by_employee',
      employeeDraft: {
        ...fresh.employeeDraft,
        fullName: input.fullName,
        cpf: input.cpf,
        role: input.role,
        sector: input.sector,
      },
      employeeSignature: {
        imagePath: signaturePath,
        signedAt: now.toISOString(),
        ip: context.ip,
        userAgent: context.userAgent,
        fullName: input.fullName,
        cpf: input.cpf,
      },
      stockWarnings: stockResult.warnings.length ? stockResult.warnings : undefined,
      updatedAt: now.toISOString(),
    };
    tx.set(collections.deliveries, next);
    return { signed: next, stock: stockResult };
  });

  emitLowStockAlerts(stock);

  // mantém o cadastro do colaborador em dia (fora da transação: não é crítico)
  if (signed.employeeId) {
    await collections.employees
      .update(signed.employeeId, {
        fullName: input.fullName,
        cpf: input.cpf,
        role: input.role,
        sector: input.sector,
        updatedAt: now.toISOString(),
      } as Partial<Employee>)
      .catch((error) => console.warn('[entregas] não atualizou o cadastro do colaborador', error));
  }

  // O PDF fica fora da transação: se falhar aqui, a rota /pdf regenera sob demanda.
  await generateTermPdf(signed);
  await collections.deliveries.update(signed.id, {
    pdfPath: signed.pdfPath,
    pdfGeneratedAt: signed.pdfGeneratedAt,
  });

  void notifier.markDeliverySigned({
    delivery: signed,
    signedAt: now,
    reviewUrl: reviewUrlFor(signed),
    company: settings.company,
  });

  console.info(
    `[entregas] ${signed.id} assinado por ${input.fullName} (${maskCpf(input.cpf)}) — ` +
      `${signed.items.length} item(ns).`,
  );

  return signed;
}

/* ------------------------------------------------------ contra-assinatura */

export async function countersign(
  delivery: Delivery,
  input: CountersignInput,
  actor: AuthenticatedAdmin,
): Promise<Delivery> {
  assertTransition(delivery, ['signed_by_employee', 'countersigned'], 'contra-assinar');

  const profile = await collections.admins.get(actor.uid);
  const signaturePath = storagePaths.adminSignature(delivery.id);

  if (input.signature) {
    const { buffer, contentType } = decodeDataUrl(input.signature);
    if (buffer.length < MIN_SIGNATURE_BYTES) throw HttpError.badRequest('A assinatura está em branco.');
    await storage.save(signaturePath, buffer, contentType);

    if (input.saveForReuse) {
      const savedPath = storagePaths.savedAdminSignature(actor.uid);
      await storage.save(savedPath, buffer, contentType);
      await collections.admins.set({
        id: actor.uid,
        uid: actor.uid,
        email: actor.email,
        displayName: profile?.displayName || actor.name,
        savedSignaturePath: savedPath,
        updatedAt: new Date().toISOString(),
      });
    }
  } else if (input.useSaved && profile?.savedSignaturePath) {
    const saved = await storage.read(profile.savedSignaturePath);
    if (!saved) throw HttpError.badRequest('Assinatura salva não encontrada. Assine na tela.');
    await storage.save(signaturePath, saved.buffer, saved.contentType);
  } else {
    throw HttpError.badRequest('Envie a assinatura ou use a assinatura salva.');
  }

  const now = new Date();
  const updated = await datastore.runTransaction(async (tx) => {
    const fresh = await tx.get(collections.deliveries, delivery.id);
    if (!fresh) throw HttpError.notFound('Entrega não encontrada.');
    assertTransition(fresh, ['signed_by_employee', 'countersigned'], 'contra-assinar');

    const next: Delivery = {
      ...fresh,
      status: 'countersigned',
      adminSignature: {
        imagePath: signaturePath,
        signedAt: now.toISOString(),
        adminUid: actor.uid,
        adminName: profile?.displayName || actor.name,
      },
      updatedAt: now.toISOString(),
    };
    tx.set(collections.deliveries, next);
    return next;
  });

  await generateTermPdf(updated);
  await collections.deliveries.update(updated.id, {
    pdfPath: updated.pdfPath,
    pdfGeneratedAt: updated.pdfGeneratedAt,
  });
  return updated;
}

/* --------------------------------------------------------------- devolução */

/**
 * Devolução total ou parcial. Validação das quantidades, atualização da
 * entrega e reentrada no estoque acontecem na mesma transação — dois registros
 * simultâneos não conseguem devolver mais do que foi entregue.
 */
export async function registerReturn(
  delivery: Delivery,
  input: DeliveryReturnInput,
  actor: AuthenticatedAdmin,
): Promise<Delivery> {
  const allowed: DeliveryStatus[] = ['signed_by_employee', 'countersigned', 'archived', 'returned'];
  assertTransition(delivery, allowed, 'registrar devolução');

  const settings = await getSettings();
  const now = new Date().toISOString();

  const { updated, stock } = await datastore.runTransaction(async (tx) => {
    const fresh = await tx.get(collections.deliveries, delivery.id);
    if (!fresh) throw HttpError.notFound('Entrega não encontrada.');
    assertTransition(fresh, allowed, 'registrar devolução');

    const items = fresh.items.map((item) => ({ ...item }));
    for (const entry of input.items) {
      const item = items[entry.itemIndex];
      if (!item) throw HttpError.badRequest(`Item ${entry.itemIndex + 1} não existe nesta entrega.`);
      const alreadyReturned = item.returnedQuantity ?? 0;
      if (alreadyReturned + entry.quantity > item.quantity) {
        throw HttpError.badRequest(
          `Devolução maior que o entregue em "${item.name}": ` +
            `entregue ${item.quantity}, já devolvido ${alreadyReturned}.`,
        );
      }
      item.returnedQuantity = alreadyReturned + entry.quantity;
    }

    const stockResult = await applyStockChangesWithin(
      tx,
      stockInChanges(fresh, input.items),
      {
        reason: 'delivery_returned',
        actor,
        deliveryId: fresh.id,
        note: input.note ?? `Devolução de ${fresh.employeeDraft.fullName}`,
      },
      settings,
    );

    const fullyReturned = items.every((item) => (item.returnedQuantity ?? 0) >= item.quantity);
    const next: Delivery = {
      ...fresh,
      items,
      status: fullyReturned ? 'returned' : fresh.status,
      returns: [
        ...(fresh.returns ?? []),
        {
          at: now,
          actorUid: actor.uid,
          actorName: actor.name,
          note: input.note,
          items: input.items.map((entry) => ({
            itemIndex: entry.itemIndex,
            quantity: entry.quantity,
            conservation: entry.conservation,
          })),
        },
      ],
      updatedAt: now,
    };
    tx.set(collections.deliveries, next);
    return { updated: next, stock: stockResult };
  });

  emitLowStockAlerts(stock);
  return updated;
}

export async function archiveDelivery(delivery: Delivery): Promise<Delivery> {
  assertTransition(delivery, ['countersigned', 'returned'], 'arquivar');
  const now = new Date().toISOString();
  const updated: Delivery = { ...delivery, status: 'archived', archivedAt: now, updatedAt: now };
  await collections.deliveries.set(updated);
  return updated;
}

/* --------------------------------------------------------------------- PDF */

/** (Re)gera o termo em PDF e preenche `pdfPath`/`pdfGeneratedAt` no objeto. */
export async function generateTermPdf(delivery: Delivery): Promise<string> {
  const settings = await getSettings();

  const [employeeSignature, adminSignature] = await Promise.all([
    delivery.employeeSignature ? storage.read(delivery.employeeSignature.imagePath) : null,
    delivery.adminSignature ? storage.read(delivery.adminSignature.imagePath) : null,
  ]);

  const pdf = await buildTermPdf({
    delivery,
    company: settings.company,
    employeeSignature: employeeSignature?.buffer,
    adminSignature: adminSignature?.buffer,
  });

  const pdfPath = storagePaths.term(delivery.id);
  await storage.save(pdfPath, Buffer.from(pdf), 'application/pdf');
  delivery.pdfPath = pdfPath;
  delivery.pdfGeneratedAt = new Date().toISOString();
  return pdfPath;
}

/* --------------------------------------------------------------- saídas */

/** DTO do painel — inclui URLs assinadas de curta duração (LGPD). */
export async function deliveryDto(delivery: Delivery, options: { withUrls?: boolean } = {}) {
  const [pdfUrl, employeeSignatureUrl, adminSignatureUrl] = options.withUrls
    ? await Promise.all([
        delivery.pdfPath ? storage.signedUrl(delivery.pdfPath) : null,
        delivery.employeeSignature ? storage.signedUrl(delivery.employeeSignature.imagePath) : null,
        delivery.adminSignature ? storage.signedUrl(delivery.adminSignature.imagePath) : null,
      ])
    : [null, null, null];

  return {
    id: delivery.id,
    status: delivery.status,
    employeeId: delivery.employeeId,
    employee: {
      ...delivery.employeeDraft,
      cpfFormatted: delivery.employeeDraft.cpf ? formatCpf(delivery.employeeDraft.cpf) : '',
      cpfMasked: delivery.employeeDraft.cpf ? maskCpf(delivery.employeeDraft.cpf) : '',
    },
    items: delivery.items.map((item, index) => ({
      ...item,
      index,
      description: itemDescription(item),
      quantityLabel: itemQuantityLabel(item),
    })),
    itemCount: delivery.items.length,
    totalQuantity: delivery.items.reduce((sum, item) => sum + item.quantity, 0),
    notes: delivery.notes,
    acceptUrl: acceptUrlFor(delivery),
    tokenExpiresAt: delivery.tokenExpiresAt,
    expired: isExpired(delivery) && (delivery.status === 'draft' || delivery.status === 'sent'),
    slackChannel: delivery.slackChannel,
    slackMessageTs: delivery.slackMessageTs,
    sentAt: delivery.sentAt,
    employeeSignature: delivery.employeeSignature
      ? {
          signedAt: delivery.employeeSignature.signedAt,
          ip: delivery.employeeSignature.ip,
          userAgent: delivery.employeeSignature.userAgent,
          fullName: delivery.employeeSignature.fullName,
          imageUrl: employeeSignatureUrl,
        }
      : null,
    adminSignature: delivery.adminSignature
      ? {
          signedAt: delivery.adminSignature.signedAt,
          adminName: delivery.adminSignature.adminName,
          adminUid: delivery.adminSignature.adminUid,
          imageUrl: adminSignatureUrl,
        }
      : null,
    pdfUrl,
    pdfGeneratedAt: delivery.pdfGeneratedAt,
    stockWarnings: delivery.stockWarnings ?? [],
    returns: delivery.returns ?? [],
    archivedAt: delivery.archivedAt,
    createdAt: delivery.createdAt,
    updatedAt: delivery.updatedAt,
  };
}

export type DeliveryDto = Awaited<ReturnType<typeof deliveryDto>>;
