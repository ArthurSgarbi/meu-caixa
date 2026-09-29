/** A transferência muda o local do dinheiro, não o total de despesas. */
export function calculateMonthlyAccountChangeCents(
  incomeCents: number,
  expenseCents: number,
  transferCents: number,
) {
  return incomeCents - expenseCents - transferCents;
}

export function calculateBudgetProgress(
  limitCents: number,
  spentCents: number,
) {
  return {
    remainingCents: limitCents - spentCents,
    usedPercentage:
      limitCents > 0 ? Math.round((spentCents / limitCents) * 100) : 0,
  };
}

/** Aceita valores comuns em pt-BR e também decimal com ponto. */
export function parseBudgetLimitCents(value: string) {
  const compact = value.replace(/[R$\s\u00a0]/g, '');
  const normalized = compact.includes(',')
    ? compact.replace(/\./g, '').replace(',', '.')
    : /^\d{1,3}(\.\d{3})+$/.test(compact)
      ? compact.replace(/\./g, '')
      : compact;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return 0;
  const [reais, centavos = ''] = normalized.split('.');
  const result = Number(reais) * 100 + Number(centavos.padEnd(2, '0'));
  return Number.isSafeInteger(result) ? result : 0;
}
