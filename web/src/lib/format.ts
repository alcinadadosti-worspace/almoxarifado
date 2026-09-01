import type { DeliveryStatus } from '@/types/domain';

const TZ = 'America/Maceio';

export const formatDate = (value?: string | null): string =>
  value
    ? new Date(value).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: TZ,
      })
    : '—';

export const formatDateTime = (value?: string | null): string =>
  value
    ? new Date(value).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: TZ,
      })
    : '—';

export const formatLongDate = (value: Date = new Date()): string =>
  value.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: TZ,
  });

/** "há 4 minutos", "em 3 dias" */
export function formatRelative(value?: string | null): string {
  if (!value) return '—';
  const diff = new Date(value).getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000_000],
    ['month', 2_592_000_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ];
  for (const [unit, ms] of units) {
    if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return 'agora';
}

export const onlyDigits = (value: string): string => (value ?? '').replace(/\D+/g, '');

export function formatCpf(value: string): string {
  const cpf = onlyDigits(value).slice(0, 11);
  return cpf
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}

export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (length: number): number => {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

/** Pluraliza a unidade livre definida pelo admin ("par" → "pares"). */
export function pluralizeUnit(unit: string, quantity: number): string {
  const clean = (unit || 'unidade').trim();
  if (quantity === 1) return clean;
  if (/(ade)$/i.test(clean)) return clean.replace(/ade$/i, 'ades');
  if (/[aeiou]$/i.test(clean)) return `${clean}s`;
  if (/r$/i.test(clean)) return `${clean}es`;
  return `${clean}s`;
}

export const quantityLabel = (quantity: number, unit: string): string =>
  `${quantity} ${pluralizeUnit(unit, quantity)}`;

/**
 * Material sem variação: uma única linha de estoque, sem nome. Um crachá não
 * tem tamanho, e pedir "escolha a variante" ali só atrapalha.
 */
export const materialVaries = (item?: { variants: Array<{ key: string }> } | null): boolean =>
  !(item && item.variants.length === 1 && !item.variants[0].key);

/**
 * "Camisa — Tamanho G", ou apenas "Crachá" quando o material não varia.
 * Espelha `itemDescription` do servidor: a tela precisa mostrar exatamente o
 * que vai sair impresso no termo.
 */
export function variantLabelOf(
  name: string | undefined,
  variantLabel: string | undefined,
  variantKey: string | undefined,
): string {
  const base = name ?? '—';
  return variantKey ? `${base} — ${variantLabel || 'Variante'} ${variantKey}` : base;
}

/* ------------------------------------------------------------- entregas */

export const STATUS_LABEL: Record<DeliveryStatus, string> = {
  draft: 'Rascunho',
  sent: 'Aguardando colaborador',
  signed_by_employee: 'Aguardando contra-assinatura',
  countersigned: 'Concluído',
  archived: 'Arquivado',
  returned: 'Devolvido',
};

export const STATUS_TONE: Record<DeliveryStatus, 'neutral' | 'gold' | 'acqua' | 'muted'> = {
  draft: 'muted',
  sent: 'neutral',
  signed_by_employee: 'gold',
  countersigned: 'acqua',
  archived: 'muted',
  returned: 'muted',
};

export const MOVEMENT_REASON_LABEL: Record<string, string> = {
  material_created: 'Cadastro',
  manual_adjustment: 'Ajuste manual',
  delivery_signed: 'Entrega assinada',
  delivery_returned: 'Devolução',
  delivery_cancelled: 'Entrega cancelada',
};

/* ---------------------------------------------------------------- Slack */

/**
 * Traduz o motivo devolvido pela API do Slack em uma instrução acionável.
 * O código de erro cru ("not_in_channel") não ajuda quem está no painel.
 */
export function slackErrorMessage(reason?: string): string {
  switch (reason) {
    case 'slack_not_configured':
      return 'O Slack não está configurado neste servidor — copie o link e envie por outro canal.';
    case 'slack_target_missing':
      return 'Este colaborador não tem ID do Slack cadastrado. Informe o ID na ficha dele ou copie o link.';
    case 'slack_not_in_channel':
      return 'O bot não está neste canal. Abra o canal no Slack e use /invite @ACQUA Almoxarifado.';
    case 'slack_channel_not_found':
      return 'Canal ou usuário não encontrado no Slack. Confira o ID informado.';
    case 'slack_missing_scope':
    case 'slack_not_allowed_token_type':
      return 'Falta uma permissão no app do Slack. Revise os escopos do bot e reinstale o app.';
    case 'slack_invalid_auth':
    case 'slack_token_revoked':
    case 'slack_account_inactive':
      return 'O token do bot é inválido ou foi revogado. Gere um novo em OAuth & Permissions.';
    case 'slack_is_archived':
      return 'Este canal está arquivado no Slack.';
    case 'slack_admin_channel_missing':
      return 'Nenhum canal do administrativo configurado (SLACK_ADMIN_CHANNEL).';
    case 'not_sent':
      return 'A entrega foi criada sem envio — copie o link abaixo.';
    default:
      return 'O Slack não conseguiu enviar a mensagem — copie o link e envie por outro canal.';
  }
}
