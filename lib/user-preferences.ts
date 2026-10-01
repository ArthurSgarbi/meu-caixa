/** Preferências de apresentação: nunca modificam valores ou regras financeiras. */
export const landingAreas = [
  'overview',
  'expenses',
  'accounts',
  'goals',
  'investments',
  'credit-cards',
  'simulations',
  'assistant',
] as const;
export type UserPreferences = {
  theme: 'dark' | 'light' | 'system';
  hideBalances: boolean;
  largeText: boolean;
  reduceMotion: boolean;
  marketAutoRefresh: boolean;
  defaultArea: (typeof landingAreas)[number];
  alertBudgets: boolean;
  alertInvoices: boolean;
  alertRecurring: boolean;
};

export const defaultPreferences: Readonly<UserPreferences> = Object.freeze({
  theme: 'dark',
  hideBalances: false,
  largeText: false,
  reduceMotion: false,
  marketAutoRefresh: true,
  defaultArea: 'overview',
  alertBudgets: true,
  alertInvoices: true,
  alertRecurring: true,
});

/** Uma lista fechada evita salvar campos inesperados ou identidades do cliente. */
export function parsePreferences(input: unknown): UserPreferences | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  const keys = Object.keys(defaultPreferences);
  if (Object.keys(value).some((key) => !keys.includes(key))) return null;
  if (
    !['dark', 'light', 'system'].includes(String(value.theme)) ||
    typeof value.theme !== 'string'
  )
    return null;
  if (
    !landingAreas.includes(value.defaultArea as UserPreferences['defaultArea'])
  )
    return null;
  for (const key of [
    'hideBalances',
    'largeText',
    'reduceMotion',
    'marketAutoRefresh',
  ]) {
    if (typeof value[key] !== 'boolean') return null;
  }
  // Contas anteriores continuam válidas sem uma migração destrutiva do JSON.
  for (const key of ['alertBudgets', 'alertInvoices', 'alertRecurring']) {
    if (key in value && typeof value[key] !== 'boolean') return null;
  }
  return {
    theme: value.theme as UserPreferences['theme'],
    hideBalances: value.hideBalances as boolean,
    largeText: value.largeText as boolean,
    reduceMotion: value.reduceMotion as boolean,
    marketAutoRefresh: value.marketAutoRefresh as boolean,
    defaultArea: value.defaultArea as UserPreferences['defaultArea'],
    alertBudgets: (value.alertBudgets as boolean | undefined) ?? true,
    alertInvoices: (value.alertInvoices as boolean | undefined) ?? true,
    alertRecurring: (value.alertRecurring as boolean | undefined) ?? true,
  };
}

const moneyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function formatPreferenceMoney(
  cents: number,
  hideBalances: boolean,
): string {
  return hideBalances ? '••••••' : moneyFormatter.format(cents / 100);
}
