import type { CompanyInfo, Delivery } from '../../domain/types';

export interface NotificationResult {
  ok: boolean;
  /** Canal/DM em que a mensagem foi publicada. */
  channel?: string;
  /** Timestamp da mensagem no Slack — usado para atualizá-la depois. */
  messageTs?: string;
  /** Motivo legível quando `ok` é falso (ex.: `slack_not_configured`). */
  reason?: string;
}

export interface DeliveryInvitePayload {
  delivery: Delivery;
  acceptUrl: string;
  company: CompanyInfo;
  /** ID de usuário (U…) ou canal (C…) do Slack. Cai para o do colaborador. */
  target?: string;
}

export interface DeliverySignedPayload {
  delivery: Delivery;
  signedAt: Date;
  reviewUrl: string;
  company: CompanyInfo;
}

export interface LowStockPayload {
  materialName: string;
  variantKey: string;
  variantLabel: string;
  stock: number;
  threshold: number;
}

/**
 * Canal de notificação plugável. O Slack é a primeira implementação; e-mail ou
 * WhatsApp entram aqui sem tocar nas regras de negócio.
 */
export interface NotificationChannel {
  readonly id: string;
  readonly label: string;
  readonly available: boolean;
  sendDeliveryInvite(payload: DeliveryInvitePayload): Promise<NotificationResult>;
  markDeliverySigned(payload: DeliverySignedPayload): Promise<NotificationResult>;
  notifyAdmins(text: string, blocks?: unknown[]): Promise<NotificationResult>;
  notifyLowStock(payload: LowStockPayload): Promise<NotificationResult>;
}
