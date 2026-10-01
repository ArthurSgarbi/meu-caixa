import {
  addMonths,
  occurrenceForMonth,
  type RecurringRule,
} from './recurring.ts';

export type OverviewInvoice = {
  id: number;
  cardName: string;
  dueDate: string;
  referenceMonth: string;
  amountCents: number;
};
export type OverviewBudget = {
  categoryId: number;
  categoryName: string;
  limitCents: number;
  spentCents: number;
};
export type OverviewOccurrence = {
  id: number;
  description: string;
  type: 'income' | 'expense';
  date: string;
  amountCents: number;
};
export type FinanceAlert = {
  id: string;
  kind: 'budget' | 'invoice' | 'recurring';
  severity: 'warning' | 'critical' | 'info';
  title: string;
  amountCents: number;
  date?: string;
  percentage?: number;
  area: 'expenses' | 'credit-cards';
};
export type OverviewData = {
  today: string;
  month: string;
  updatedAt: string;
  accountBalanceCents: number;
  reservedGoalCents?: number;
  availableBalanceCents?: number;
  walletBalanceCents: number;
  portfolioValueCents: number;
  monthly: { incomeCents: number; expenseCents: number; transferCents: number };
  invoices: OverviewInvoice[];
  occurrences: OverviewOccurrence[];
  budgets: OverviewBudget[];
  alerts: FinanceAlert[];
};

export function daysBetween(from: string, to: string) {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
}

/** Inclui pendências do mês atual e previsões dos próximos 30 dias, sem repetir confirmadas. */
export function pendingOccurrences(
  rules: RecurringRule[],
  confirmed: { ruleId: number; date: string }[],
  today: string,
): OverviewOccurrence[] {
  const known = new Set(confirmed.map((item) => `${item.ruleId}:${item.date}`));
  const month = today.slice(0, 7);
  return rules
    .filter((rule) => rule.active)
    .flatMap((rule) =>
      [month, addMonths(month, 1)].flatMap((reference) => {
        const date = occurrenceForMonth(rule, reference);
        if (
          !date ||
          daysBetween(today, date) > 30 ||
          known.has(`${rule.id}:${date}`)
        )
          return [];
        return [
          {
            id: rule.id,
            description: rule.description,
            type: rule.type,
            date,
            amountCents: rule.amountCents,
          },
        ];
      }),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
}

/** Avisos derivados dos registros: nunca criam pagamentos nem confirmam previsões. */
export function buildFinanceAlerts(
  today: string,
  budgets: OverviewBudget[],
  invoices: OverviewInvoice[],
  occurrences: OverviewOccurrence[],
): FinanceAlert[] {
  const alerts: FinanceAlert[] = [];
  for (const budget of budgets) {
    if (
      budget.limitCents <= 0 ||
      budget.spentCents * 100 < budget.limitCents * 80
    )
      continue;
    const reached = budget.spentCents >= budget.limitCents;
    alerts.push({
      id: `budget:${today.slice(0, 7)}:${budget.categoryId}`,
      kind: 'budget',
      severity: reached ? 'critical' : 'warning',
      title: `${budget.categoryName}: ${reached ? 'limite atingido ou ultrapassado' : 'orçamento próximo do limite'}`,
      amountCents: budget.limitCents - budget.spentCents,
      percentage: Math.floor((budget.spentCents * 100) / budget.limitCents),
      area: 'expenses',
    });
  }
  for (const invoice of invoices) {
    const days = daysBetween(today, invoice.dueDate);
    if (invoice.amountCents <= 0 || days > 7) continue;
    alerts.push({
      id: `invoice:${invoice.id}`,
      kind: 'invoice',
      severity: days < 0 ? 'critical' : 'warning',
      title: `${invoice.cardName}: ${days < 0 ? 'fatura vencida não marcada como paga' : days === 0 ? 'fatura vence hoje' : 'fatura vence em até 7 dias'}`,
      amountCents: invoice.amountCents,
      date: invoice.dueDate,
      area: 'credit-cards',
    });
  }
  for (const occurrence of occurrences) {
    if (occurrence.date > today) continue;
    alerts.push({
      id: `recurring:${occurrence.id}:${occurrence.date}`,
      kind: 'recurring',
      severity: 'info',
      title: `${occurrence.description}: confirmação pendente`,
      amountCents: occurrence.amountCents,
      date: occurrence.date,
      area: 'expenses',
    });
  }
  const order = { critical: 0, warning: 1, info: 2 };
  return alerts.sort(
    (a, b) =>
      order[a.severity] - order[b.severity] ||
      (a.date ?? today).localeCompare(b.date ?? today) ||
      a.id.localeCompare(b.id),
  );
}

export function visibleFinanceAlerts(
  alerts: FinanceAlert[],
  preferences: {
    alertBudgets: boolean;
    alertInvoices: boolean;
    alertRecurring: boolean;
  },
) {
  return alerts.filter((alert) =>
    alert.kind === 'budget'
      ? preferences.alertBudgets
      : alert.kind === 'invoice'
        ? preferences.alertInvoices
        : preferences.alertRecurring,
  );
}
