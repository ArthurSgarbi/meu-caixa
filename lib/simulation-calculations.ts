export type SimulationPoint = {
  month: number;
  valueCents: number;
};

export type DebtSimulation = {
  points: SimulationPoint[];
  finalAmountCents: number;
  totalInterestCents: number;
};

export type InvestmentSimulation = {
  points: SimulationPoint[];
  finalAmountCents: number;
  totalContributedCents: number;
  totalEarningsCents: number;
};

function validMoney(value: number) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validRate(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

function validMonths(value: number, maximum: number) {
  return Number.isInteger(value) && value >= 1 && value <= maximum;
}

/** Calcula a evolução mensal da dívida pelo regime de juros compostos. */
export function simulateDebt(
  principalCents: number,
  monthlyRatePercent: number,
  months: number,
): DebtSimulation {
  if (
    !validMoney(principalCents) ||
    principalCents === 0 ||
    !validRate(monthlyRatePercent) ||
    !validMonths(months, 120)
  ) {
    return { points: [], finalAmountCents: 0, totalInterestCents: 0 };
  }

  const monthlyRate = monthlyRatePercent / 100;
  const points: SimulationPoint[] = [{ month: 0, valueCents: principalCents }];

  for (let month = 1; month <= months; month += 1) {
    const valueCents = Math.round(
      principalCents * Math.pow(1 + monthlyRate, month),
    );
    points.push({ month, valueCents });
  }

  const finalAmountCents = points.at(-1)?.valueCents ?? principalCents;
  return {
    points,
    finalAmountCents,
    totalInterestCents: finalAmountCents - principalCents,
  };
}

/**
 * Calcula o valor futuro com aportes no fim de cada mês (série postecipada).
 * O laço também gera os pontos usados pelo gráfico sem recalcular a série.
 */
export function simulateInvestment(
  initialValueCents: number,
  monthlyContributionCents: number,
  monthlyRatePercent: number,
  months: number,
): InvestmentSimulation {
  if (
    !validMoney(initialValueCents) ||
    !validMoney(monthlyContributionCents) ||
    (initialValueCents === 0 && monthlyContributionCents === 0) ||
    !validRate(monthlyRatePercent) ||
    !validMonths(months, 600)
  ) {
    return {
      points: [],
      finalAmountCents: 0,
      totalContributedCents: 0,
      totalEarningsCents: 0,
    };
  }

  const monthlyRate = monthlyRatePercent / 100;
  const points: SimulationPoint[] = [
    { month: 0, valueCents: initialValueCents },
  ];
  let balanceCents = initialValueCents;

  for (let month = 1; month <= months; month += 1) {
    balanceCents = balanceCents * (1 + monthlyRate) + monthlyContributionCents;
    points.push({ month, valueCents: Math.round(balanceCents) });
  }

  const finalAmountCents = Math.round(balanceCents);
  const totalContributedCents =
    initialValueCents + monthlyContributionCents * months;

  return {
    points,
    finalAmountCents,
    totalContributedCents,
    totalEarningsCents: finalAmountCents - totalContributedCents,
  };
}
