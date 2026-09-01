import type { CompanyInfo, DeliveryItem } from './types';

/** Dados da EMPRESA — fixos, conforme o Termo de Responsabilidade oficial. */
export const DEFAULT_COMPANY: CompanyInfo = {
  name: 'Grupo Alcina Maria',
  cnpj: '14.750.618/0001-83',
  headquarters: 'Penedo, Alagoas — BR',
  city: 'Penedo',
  state: 'AL',
};

export const TERM_TITLE = 'TERMO DE RESPONSABILIDADE — MATERIAIS DA EMPRESA';

export const TERM_SECTIONS = {
  identification: '1. IDENTIFICAÇÃO DO(A) COLABORADOR(A)',
  materials: '2. DESCRIÇÃO DOS MATERIAIS ENTREGUES',
  responsibility: '3. RESPONSABILIDADE E DEVOLUÇÃO',
} as const;

export function termIntro(company: CompanyInfo): string {
  return (
    `Pelo presente instrumento particular, de um lado ${company.name}, inscrita no ` +
    `CNPJ nº ${company.cnpj}, com sede em ${company.headquarters}, doravante denominada ` +
    `EMPRESA, e, de outro lado, o(a) COLABORADOR(A) abaixo identificado(a), firmam o ` +
    `presente Termo de Responsabilidade.`
  );
}

export const TERM_RESPONSIBILITY_TEXT =
  'O(a) colaborador(a) compromete-se a utilizar os materiais exclusivamente para fins ' +
  'profissionais, zelando por sua guarda e conservação, bem como devolvê-los quando ' +
  'solicitado ou no desligamento, em bom estado, ressalvado o desgaste natural pelo uso ' +
  'adequado.';

/** Fuso da empresa. O servidor roda em UTC; a data do termo é a de Penedo. */
export const COMPANY_TIME_ZONE = 'America/Maceio';

const longDate = new Intl.DateTimeFormat('pt-BR', {
  timeZone: COMPANY_TIME_ZONE,
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

/**
 * "Penedo/AL, 31 de agosto de 2026."
 *
 * Formatado no fuso da empresa, não no do servidor: uma assinatura às 23h em
 * Penedo já é o dia seguinte em UTC, e o termo tem que carregar a data local.
 */
export function termPlaceAndDate(company: CompanyInfo, date: Date): string {
  return `${company.city}/${company.state}, ${longDate.format(date)}.`;
}

/**
 * Descrição do material como aparece na tabela do termo — a variante entra
 * junto do nome, exatamente como pedido: "Camisa — Tamanho G".
 */
export function itemDescription(item: DeliveryItem): string {
  const parts: string[] = [item.name];
  if (item.variantKey) parts.push(`${item.variantLabel || 'Variante'} ${item.variantKey}`);
  const extras = Object.entries(item.customValues ?? {})
    .filter(([, value]) => String(value ?? '').trim().length > 0)
    .map(([label, value]) => `${label}: ${value}`);
  const head = parts.join(' — ');
  return extras.length ? `${head} (${extras.join('; ')})` : head;
}

/** "12 unidades", "1 par", "3 dezenas". */
export function itemQuantityLabel(item: DeliveryItem): string {
  const unit = (item.unit || 'unidade').trim();
  if (item.quantity === 1) return `${item.quantity} ${unit}`;
  if (/(ade|dade)$/i.test(unit)) return `${item.quantity} ${unit.replace(/ade$/i, 'ades')}`;
  if (/[aeiou]$/i.test(unit)) return `${item.quantity} ${unit}s`;
  if (/r$/i.test(unit)) return `${item.quantity} ${unit}es`;
  return `${item.quantity} ${unit}s`;
}
