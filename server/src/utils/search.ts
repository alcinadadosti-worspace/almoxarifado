/**
 * Normalização para busca: sem acentos e sem caixa.
 *
 * Digitar "jose" tem de encontrar "José", e "calca" tem de encontrar "Calça" —
 * ninguém acentua o que digita num campo de busca.
 */
export const fold = (value: string): string =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

/** `true` quando todos os termos da busca aparecem em algum dos campos. */
export function matchesSearch(search: string, ...fields: Array<string | undefined>): boolean {
  const needle = fold(search);
  if (!needle) return true;
  const haystack = fold(fields.filter(Boolean).join(' '));
  return needle.split(/\s+/).every((term) => haystack.includes(term));
}
