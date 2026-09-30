/** Converte dinheiro sem arredondar entradas inválidas nem apagar caracteres. */
export function parseCurrencyToCents(value: string): number {
  const compact = value
    .trim()
    .replace(/^R\$\s*/i, '')
    .replace(/[\s\u00a0]/g, '');
  const normalized = compact.includes(',')
    ? /^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(compact)
      ? compact.replace(/\./g, '').replace(',', '.')
      : ''
    : /^\d{1,3}(?:\.\d{3})+$/.test(compact)
      ? compact.replace(/\./g, '')
      : compact;
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return Number.NaN;
  const [reais, centavos = ''] = normalized.split('.');
  const cents = Number(reais) * 100 + Number(centavos.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : Number.NaN;
}

export function parseDecimal(value: string): number {
  const compact = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(compact)) return Number.NaN;
  const number = Number(compact);
  return Number.isFinite(number) ? number : Number.NaN;
}
