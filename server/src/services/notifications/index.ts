import { env } from '../../config/env';
import { SlackNotificationChannel } from './slack';
import type {
  DeliveryInvitePayload,
  DeliverySignedPayload,
  LowStockPayload,
  NotificationChannel,
  NotificationResult,
} from './types';

/**
 * Canal inerte usado quando não há credenciais configuradas. Mantém a mesma
 * interface para que o restante do sistema nunca precise perguntar "tem Slack?"
 * — a UI apenas exibe o link para o admin copiar.
 */
class NoopNotificationChannel implements NotificationChannel {
  readonly id = 'none';
  readonly label = 'Link manual';
  readonly available = false;

  private readonly result: NotificationResult = { ok: false, reason: 'slack_not_configured' };

  async sendDeliveryInvite(_payload: DeliveryInvitePayload): Promise<NotificationResult> {
    return this.result;
  }

  async markDeliverySigned(_payload: DeliverySignedPayload): Promise<NotificationResult> {
    return this.result;
  }

  async notifyAdmins(_text: string, _blocks?: unknown[]): Promise<NotificationResult> {
    return this.result;
  }

  async notifyLowStock(_payload: LowStockPayload): Promise<NotificationResult> {
    return this.result;
  }
}

export const notifier: NotificationChannel = env.slack.configured
  ? new SlackNotificationChannel(env.slack.botToken)
  : new NoopNotificationChannel();

export function notificationStatus() {
  return {
    channel: notifier.id,
    label: notifier.label,
    available: notifier.available,
    adminChannelConfigured: Boolean(env.slack.adminChannel),
  };
}

export type {
  DeliveryInvitePayload,
  DeliverySignedPayload,
  LowStockPayload,
  NotificationChannel,
  NotificationResult,
} from './types';
