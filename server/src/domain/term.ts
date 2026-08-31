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

const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** "Penedo/AL, 31 de agosto de 2026." */
export function termPlaceAndDate(company: CompanyInfo, date: Date): string {
  const d = date.getDate().toString().padStart(2, '0');
  return `${company.city}/${company.state}, ${d} de ${MONTHS[date.getMonth()]} de ${date.getFullYear()}.`;
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
