import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getDb } from '@/db';
import {
  BRAPI_PROVIDER_NAME,
  isMarketOpen,
  normalizeBrapiQuote,
  type BrapiQuote,
} from '@/lib/market-data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const tickerPattern = /^[A-Z0-9]{4,12}$/;

type BrapiResponse = {
  results?: BrapiQuote[];
};

function json(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  return Response.json(data, { ...init, headers });
}

export async function GET() {
  try {
    const user = await getChatGPTUser();
    if (!user) {
      return json(
        { error: 'Entre na sua conta para acompanhar cotações.' },
        { status: 401 },
      );
    }

    const token = process.env.BRAPI_TOKEN?.trim();
    if (!token) {
      return json(
        {
          error:
            'A fonte de cotações ainda não foi configurada pelo administrador.',
          code: 'MARKET_DATA_NOT_CONFIGURED',
        },
        { status: 503 },
      );
    }

    const tickerResult = await getDb()
      .prepare(
        `SELECT DISTINCT ticker
           FROM investments
          WHERE owner_id = ? AND ticker IS NOT NULL
          ORDER BY ticker
          LIMIT 20`,
      )
      .bind(user.userId)
      .all<{ ticker: string }>();

    const tickers = tickerResult.results
      .map((row) => row.ticker.trim().toUpperCase())
      .filter((ticker) => tickerPattern.test(ticker));

    if (tickers.length === 0) {
      return json({
        provider: BRAPI_PROVIDER_NAME,
        marketOpen: false,
        requestedAt: new Date().toISOString(),
        quotes: [],
      });
    }

    const url = new URL(
      `https://brapi.dev/api/quote/${tickers.map(encodeURIComponent).join(',')}`,
    );
    url.searchParams.set('range', '1d');
    url.searchParams.set('interval', '1m');

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) {
      console.error('Market data provider request failed', response.status);
      return json(
        {
          error: 'A fonte de cotações está temporariamente indisponível.',
          code: 'MARKET_DATA_PROVIDER_ERROR',
        },
        { status: 502 },
      );
    }

    const payload = (await response.json()) as BrapiResponse;
    const quotes = (payload.results ?? []).flatMap((quote) => {
      const normalized = normalizeBrapiQuote(quote);
      return normalized ? [normalized] : [];
    });

    return json({
      provider: BRAPI_PROVIDER_NAME,
      marketOpen: isMarketOpen(quotes),
      requestedAt: new Date().toISOString(),
      quotes,
    });
  } catch (error) {
    console.error('Failed to load market data', error);
    return json(
      { error: 'Não foi possível atualizar as cotações agora.' },
      { status: 500 },
    );
  }
}
