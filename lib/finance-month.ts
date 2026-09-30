const brazilDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Data civil brasileira; nunca depende do fuso do servidor ou navegador. */
export function todayInBrazil(now: Date = new Date()) {
  const parts = Object.fromEntries(
    brazilDateFormatter
      .formatToParts(now)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function currentMonthInBrazil(now: Date = new Date()) {
  return todayInBrazil(now).slice(0, 7);
}

export function getMonthRange(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [year, monthNumber] = month.split('-').map(Number);
  const start = `${month}-01`;
  const next = new Date(Date.UTC(year, monthNumber, 1))
    .toISOString()
    .slice(0, 10);
  return { start, next };
}
