import { App, ExpressReceiver } from '@slack/bolt';
import type { Router } from 'express';
import { env } from '../config/env';
import { collections, getSettings } from '../data';
import type { Material } from '../domain/types';

/**
 * Bot de Slack (Slack Bolt).
 *
 * Arquitetura pronta e plugável: sem `SLACK_BOT_TOKEN`/`SLACK_SIGNING_SECRET`
 * nada é montado e a aplicação segue 100% funcional — o admin copia o link.
 *
 * Endpoints (configure no painel do app Slack):
 *   Event Subscriptions ....... POST /api/slack/events
 *   Interactivity ............. POST /api/slack/interactions
 *   Slash Commands ............ POST /api/slack/commands
 */

let receiver: ExpressReceiver | null = null;
let boltApp: App | null = null;

const stockLine = (material: Material): string => {
  // Material sem variação tem uma linha só, sem nome: mostra apenas o saldo.
  const varies = !(material.variants.length === 1 && !material.variants[0].key);
  const variants = varies
    ? material.variants.map((variant) => `${variant.key}: *${variant.stock}*`).join('  ·  ')
    : `*${material.variants[0]?.stock ?? 0}*`;
  const axis = varies ? ` (${material.variantLabel})` : '';
  return `• *${material.name}*${axis} — ${variants || 'sem variantes'} · ${material.unit}`;
};

async function searchMaterials(term: string): Promise<Material[]> {
  const materials = await collections.materials.list({ orderBy: ['name', 'asc'] });
  const active = materials.filter((material) => material.active);
  if (!term) return active.slice(0, 12);
  const needle = term.toLowerCase();
  return active
    .filter((material) =>
      [material.name, material.category, material.brand, material.model]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
    .slice(0, 12);
}

export function createSlackRouter(): Router | null {
  if (!env.slack.configured) return null;
  if (receiver) return receiver.router;

  receiver = new ExpressReceiver({
    signingSecret: env.slack.signingSecret,
    endpoints: {
      events: '/events',
      interactions: '/interactions',
      commands: '/commands',
    },
    processBeforeResponse: true,
  });

  boltApp = new App({ token: env.slack.botToken, receiver });

  /* ------------------------------------------------- /almoxarifado … */
  boltApp.command('/almoxarifado', async ({ command, ack, respond }) => {
    await ack();
    const [subcommand = 'estoque', ...rest] = command.text.trim().split(/\s+/);
    const term = rest.join(' ');

    if (subcommand === 'ajuda' || subcommand === 'help') {
      await respond({
        response_type: 'ephemeral',
        text:
          '*ACQUA Almoxarifado*\n' +
          '`/almoxarifado estoque [material]` — consulta o saldo por variante\n' +
          '`/almoxarifado entregas` — resumo das assinaturas pendentes',
      });
      return;
    }

    if (subcommand === 'entregas') {
      const deliveries = await collections.deliveries.list({
        orderBy: ['createdAt', 'desc'],
        limit: 100,
      });
      const pending = deliveries.filter((d) => d.status === 'signed_by_employee').length;
      const waiting = deliveries.filter((d) => d.status === 'sent').length;
      await respond({
        response_type: 'ephemeral',
        text:
          `*Fila de assinaturas*\n` +
          `• Aguardando o colaborador: *${waiting}*\n` +
          `• Aguardando contra-assinatura: *${pending}*\n` +
          `${env.appBaseUrl}/app/entregas`,
      });
      return;
    }

    const materials = await searchMaterials(term);
    await respond({
      response_type: 'ephemeral',
      text: materials.length
        ? `*Estoque${term ? ` — "${term}"` : ''}*\n${materials.map(stockLine).join('\n')}`
        : `Nenhum material encontrado para "${term}".`,
    });
  });

  /* ------------------------------------- cliques nos botões do card */
  boltApp.action('open_delivery_term', async ({ ack }) => {
    await ack(); // botão do tipo URL: só confirmamos o clique
  });
  boltApp.action('open_delivery_review', async ({ ack }) => {
    await ack();
  });

  /* --------------------------------------------------- app_mention */
  boltApp.event('app_mention', async ({ event, say }) => {
    const settings = await getSettings();
    await say({
      thread_ts: (event as { ts?: string }).ts,
      text:
        `Oi! Sou o assistente de almoxarifado do ${settings.company.name}. ` +
        'Use `/almoxarifado estoque camisa` para consultar o saldo.',
    });
  });

  boltApp.error(async (error) => {
    console.error('[slack] erro no bot', error);
  });

  console.info('[slack] bot ativo em /api/slack/{events,interactions,commands}');
  return receiver.router;
}

export function getBoltApp(): App | null {
  return boltApp;
}
