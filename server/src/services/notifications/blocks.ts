import { itemDescription, itemQuantityLabel } from '../../domain/term';
import type { CompanyInfo, Delivery } from '../../domain/types';

const dateTime = (value: Date | string): string =>
  new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Maceio',
  });

/** Card do termo enviado ao colaborador por DM. */
export function deliveryInviteBlocks(
  delivery: Delivery,
  acceptUrl: string,
  company: CompanyInfo,
): unknown[] {
  const items = delivery.items
    .map((item) => `• *${itemDescription(item)}* — ${itemQuantityLabel(item)} (${item.conservation})`)
    .join('\n');

  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'Termo de Responsabilidade — Materiais', emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `Olá, *${delivery.employeeDraft.fullName || 'colaborador(a)'}*! 👋\n` +
          `A ${company.name} separou os materiais abaixo para você. ` +
          `Confira, assine digitalmente e pronto — leva menos de um minuto.`,
      },
    },
    { type: 'section', text: { type: 'mrkdwn', text: items } },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          style: 'primary',
          text: { type: 'plain_text', text: 'Assinar termo', emoji: true },
          url: acceptUrl,
          action_id: 'open_delivery_term',
        },
      ],
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Link pessoal e de uso único · válido até ${dateTime(delivery.tokenExpiresAt)}`,
        },
      ],
    },
  ];
}

/** Mesmo card, já assinado — substitui a mensagem original. */
export function deliverySignedBlocks(
  delivery: Delivery,
  signedAt: Date,
  company: CompanyInfo,
): unknown[] {
  const items = delivery.items
    .map((item) => `• *${itemDescription(item)}* — ${itemQuantityLabel(item)}`)
    .join('\n');

  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'Termo assinado ✅', emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `Obrigado, *${delivery.employeeSignature?.fullName ?? delivery.employeeDraft.fullName}*!\n` +
          `Assinado em *${dateTime(signedAt)}* · ${company.name}`,
      },
    },
    { type: 'section', text: { type: 'mrkdwn', text: items } },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: 'Uma via em PDF fica arquivada com o almoxarifado.' },
      ],
    },
  ];
}

/** Aviso para o canal do administrativo quando alguém assina. */
export function adminSignedNoticeBlocks(delivery: Delivery, reviewUrl: string): unknown[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `*${delivery.employeeSignature?.fullName ?? delivery.employeeDraft.fullName}* assinou o ` +
          `termo de ${delivery.items.length} ${delivery.items.length === 1 ? 'item' : 'itens'}.\n` +
          `Falta a contra-assinatura do representante da empresa.`,
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Revisar e contra-assinar', emoji: true },
          url: reviewUrl,
          action_id: 'open_delivery_review',
        },
      ],
    },
  ];
}

export function lowStockBlocks(
  materialName: string,
  variantLabel: string,
  variantKey: string,
  stock: number,
  threshold: number,
): unknown[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `:warning: *Estoque baixo* — ${materialName} (${variantLabel} ${variantKey}) ` +
          `está com *${stock}* em estoque (mínimo ${threshold}).`,
      },
    },
  ];
}
