import { WebClient } from '@slack/web-api';
import { env } from '../../config/env';
import { getSettings } from '../../data';

/**
 * Canal do administrativo: o que foi salvo em Configurações vence a variável
 * de ambiente. Antes o painel deixava editar o canal mas o bot ignorava.
 */
async function resolveAdminChannel(): Promise<string> {
  const settings = await getSettings().catch(() => null);
  return settings?.slackAdminChannel || env.slack.adminChannel;
}
import {
  adminSignedNoticeBlocks,
  deliveryInviteBlocks,
  deliverySignedBlocks,
  lowStockBlocks,
} from './blocks';
import type {
  DeliveryInvitePayload,
  DeliverySignedPayload,
  LowStockPayload,
  NotificationChannel,
  NotificationResult,
} from './types';

/**
 * Canal Slack. Só é instanciado quando `SLACK_BOT_TOKEN` e
 * `SLACK_SIGNING_SECRET` existem — o Slack é notificação, nunca dependência.
 */
export class SlackNotificationChannel implements NotificationChannel {
  readonly id = 'slack';
  readonly label = 'Slack';
  readonly available = true;
  private readonly client: WebClient;

  constructor(token: string) {
    this.client = new WebClient(token);
  }

  private async resolveConversation(target: string): Promise<string> {
    // Para usuários (U…/W…) é preciso abrir a DM antes de postar.
    if (/^[UW][A-Z0-9]+$/i.test(target)) {
      const opened = await this.client.conversations.open({ users: target });
      const id = opened.channel?.id;
      if (!id) throw new Error('Não foi possível abrir a DM com o colaborador.');
      return id;
    }
    return target;
  }

  async sendDeliveryInvite(payload: DeliveryInvitePayload): Promise<NotificationResult> {
    const target = payload.target || payload.delivery.employeeDraft.slackUserId;
    if (!target) return { ok: false, reason: 'slack_target_missing' };

    try {
      const channel = await this.resolveConversation(target);
      const response = await this.client.chat.postMessage({
        channel,
        text: `Termo de Responsabilidade — ${payload.company.name}: ${payload.acceptUrl}`,
        blocks: deliveryInviteBlocks(
          payload.delivery,
          payload.acceptUrl,
          payload.company,
        ) as never,
        unfurl_links: false,
      });
      return { ok: true, channel, messageTs: response.ts };
    } catch (error) {
      console.error('[slack] falha ao enviar convite', error);
      return { ok: false, reason: describe(error) };
    }
  }

  async markDeliverySigned(payload: DeliverySignedPayload): Promise<NotificationResult> {
    const { delivery } = payload;
    const results: NotificationResult[] = [];

    if (delivery.slackChannel && delivery.slackMessageTs) {
      try {
        await this.client.chat.update({
          channel: delivery.slackChannel,
          ts: delivery.slackMessageTs,
          text: 'Termo assinado ✅',
          blocks: deliverySignedBlocks(delivery, payload.signedAt, payload.company) as never,
        });
        results.push({ ok: true, channel: delivery.slackChannel, messageTs: delivery.slackMessageTs });
      } catch (error) {
        console.error('[slack] falha ao atualizar mensagem', error);
        results.push({ ok: false, reason: describe(error) });
      }
    }

    const adminChannel = await resolveAdminChannel();
    if (adminChannel) {
      try {
        await this.client.chat.postMessage({
          channel: adminChannel,
          text: `Termo assinado por ${delivery.employeeDraft.fullName}`,
          blocks: adminSignedNoticeBlocks(delivery, payload.reviewUrl) as never,
          unfurl_links: false,
        });
      } catch (error) {
        console.error('[slack] falha ao avisar o canal do administrativo', error);
      }
    }

    return results[0] ?? { ok: true };
  }

  async notifyAdmins(text: string, blocks?: unknown[]): Promise<NotificationResult> {
    const channel = await resolveAdminChannel();
    if (!channel) return { ok: false, reason: 'slack_admin_channel_missing' };
    try {
      const response = await this.client.chat.postMessage({
        channel,
        text,
        blocks: blocks as never,
        unfurl_links: false,
      });
      return { ok: true, channel, messageTs: response.ts };
    } catch (error) {
      console.error('[slack] falha ao notificar administrativo', error);
      return { ok: false, reason: describe(error) };
    }
  }

  async notifyLowStock(payload: LowStockPayload): Promise<NotificationResult> {
    return this.notifyAdmins(
      `Estoque baixo: ${payload.materialName} (${payload.variantLabel} ${payload.variantKey})`,
      lowStockBlocks(
        payload.materialName,
        payload.variantLabel,
        payload.variantKey,
        payload.stock,
        payload.threshold,
      ),
    );
  }
}

function describe(error: unknown): string {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: { error?: string } }).data;
    if (data?.error) return `slack_${data.error}`;
  }
  return error instanceof Error ? error.message : 'slack_unknown_error';
}
