export const BRAPI_PROVIDER_NAME = 'brapi.dev';

const openMarketStates = new Set(['REGULAR', 'POST']);

export type BrapiHistoryPoint = {
  date?: number;
  close?: number | null;
};

export type BrapiQuote = {
  symbol?: string;
  shortName?: string;
  currency?: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  regularMarketTime?: string | number;
  marketState?: string;
  historicalDataPrice?: BrapiHistoryPoint[];
};

export type MarketQuote = {
  ticker: string;
  name: string;
  currency: string;
  price: number;
  changePercent: number;
  marketState: string;
  lastUpdatedAt: string | null;
  points: Array<{ timestamp: string; price: number }>;
};

function toIsoDate(value: string | number | undefined) {
  if (value === undefined) return null;
  const date =
    typeof value === 'number'
      ? new Date(value > 10_000_000_000 ? value : value * 1000)
      : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function normalizeBrapiQuote(quote: BrapiQuote): MarketQuote | null {
  const ticker = quote.symbol?.trim().toUpperCase() ?? '';
  const price = Number(quote.regularMarketPrice);
  if (!/^[A-Z0-9]{4,12}$/.test(ticker) || !Number.isFinite(price)) {
    return null;
  }

  const points = (quote.historicalDataPrice ?? []).flatMap((point) => {
    const timestamp = toIsoDate(point.date);
    const pointPrice = Number(point.close);
    return timestamp && Number.isFinite(pointPrice)
      ? [{ timestamp, price: pointPrice }]
      : [];
  });

  return {
    ticker,
    name: quote.shortName?.trim() || ticker,
    currency: quote.currency?.trim() || 'BRL',
    price,
    changePercent: Number.isFinite(Number(quote.regularMarketChangePercent))
      ? Number(quote.regularMarketChangePercent)
      : 0,
    marketState: quote.marketState?.trim().toUpperCase() || 'UNKNOWN',
    lastUpdatedAt: toIsoDate(quote.regularMarketTime),
    points,
  };
}

export function isMarketOpen(quotes: MarketQuote[]) {
  return quotes.some((quote) => openMarketStates.has(quote.marketState));
}
