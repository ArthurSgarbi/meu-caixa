export type DailyYieldResult = {
  effectiveAnnualRatePercent: number;
  dailyRate: number;
  dailyYieldCents: number;
};

/**
 * Converte CDI anual em taxa equivalente diária composta, usando 252 dias
 * úteis, e aplica o percentual contratado pelo CDB.
 */
export function calculateDailyYield(
  balanceCents: number,
  annualCdiRatePercent: number,
  cdbPercentage: number,
): DailyYieldResult {
  if (
    !Number.isFinite(balanceCents) ||
    !Number.isFinite(annualCdiRatePercent) ||
    !Number.isFinite(cdbPercentage) ||
    balanceCents < 0 ||
    annualCdiRatePercent < 0 ||
    cdbPercentage < 0
  ) {
    return {
      effectiveAnnualRatePercent: 0,
      dailyRate: 0,
      dailyYieldCents: 0,
    };
  }

  // Primeiro converte o CDI anual para a taxa diária equivalente pedida pela
  // regra de negócio. Depois aplica o percentual contratado do CDB.
  const annualCdiRate = annualCdiRatePercent / 100;
  const dailyCdiRate = Math.pow(1 + annualCdiRate, 1 / 252) - 1;
  const dailyRate = dailyCdiRate * (cdbPercentage / 100);
  const effectiveAnnualRatePercent = (Math.pow(1 + dailyRate, 252) - 1) * 100;

  return {
    effectiveAnnualRatePercent,
    dailyRate,
    dailyYieldCents: Math.round(balanceCents * dailyRate),
  };
}
