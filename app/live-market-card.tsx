'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Clock3,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';

type TrackedAsset = {
  id: number;
  name: string;
  ticker: string;
  quantity: number;
};

type MarketQuote = {
  ticker: string;
  name: string;
  currency: string;
  price: number;
  changePercent: number;
  marketState: string;
  lastUpdatedAt: string | null;
  points: Array<{ timestamp: string; price: number }>;
};

type MarketData = {
  provider: string;
  marketOpen: boolean;
  requestedAt: string;
  quotes: MarketQuote[];
};

type MarketResponse = Partial<MarketData> & {
  error?: string;
  code?: string;
};

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

function formatQuoteTime(value: string | null) {
  if (!value) return 'horário indisponível';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'horário indisponível'
    : timeFormatter.format(date);
}

export function LiveMarketCard({ assets }: { assets: TrackedAsset[] }) {
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [selectedTicker, setSelectedTicker] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const assetKey = assets
    .map((asset) => `${asset.ticker}:${asset.quantity}`)
    .sort()
    .join('|');

  const quantities = useMemo(() => {
    const result = new Map<string, number>();
    for (const asset of assets) {
      result.set(
        asset.ticker,
        (result.get(asset.ticker) ?? 0) + asset.quantity,
      );
    }
    return result;
  }, [assets]);

  const loadMarketData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await fetch('/api/market-data', {
        cache: 'no-store',
        signal,
      });
      const result = (await response.json()) as MarketResponse;
      if (!response.ok) {
        throw new Error(
          result.error ?? 'Não foi possível carregar as cotações.',
        );
      }

      const nextData = result as MarketData;
      setMarketData(nextData);
      setSelectedTicker((current) =>
        nextData.quotes.some((quote) => quote.ticker === current)
          ? current
          : (nextData.quotes[0]?.ticker ?? ''),
      );
      setError('');
      return nextData.marketOpen;
    } catch (requestError) {
      if (
        requestError instanceof DOMException &&
        requestError.name === 'AbortError'
      ) {
        return false;
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível carregar as cotações.',
      );
      return false;
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!assetKey) {
      return;
    }

    const controller = new AbortController();
    let timer: number | undefined;

    const scheduleRefresh = async () => {
      if (document.hidden || controller.signal.aborted) return;
      const marketOpen = await loadMarketData(controller.signal);
      if (controller.signal.aborted) return;
      timer = window.setTimeout(
        scheduleRefresh,
        marketOpen ? 60_000 : 15 * 60_000,
      );
    };

    const handleVisibilityChange = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      if (!document.hidden) void scheduleRefresh();
    };

    queueMicrotask(() => void scheduleRefresh());
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [assetKey, loadMarketData]);

  const selectedQuote = marketData?.quotes.find(
    (quote) => quote.ticker === selectedTicker,
  );
  const livePortfolioValue = useMemo(
    () =>
      (marketData?.quotes ?? []).reduce(
        (total, quote) =>
          total + quote.price * (quantities.get(quote.ticker) ?? 0),
        0,
      ),
    [marketData?.quotes, quantities],
  );

  if (assets.length === 0) {
    return (
      <Card className="border-0 shadow-[0_18px_50px_rgba(0,0,0,.2)] ring-1 ring-white/15">
        <CardHeader className="border-b border-white/10 pb-4">
          <CardTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <Activity className="size-5 text-white" />
            Mercado ao vivo
          </CardTitle>
        </CardHeader>
        <CardContent className="py-10 text-center">
          <Activity className="mx-auto mb-3 size-9 text-white/70" />
          <p className="font-semibold">Nenhum ativo conectado à bolsa</p>
          <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
            Edite ou cadastre uma ação ou FII informando o código B3 e a
            quantidade. Exemplos: PETR4, VALE3 e MXRF11.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-[0_18px_50px_rgba(0,0,0,.2)] ring-1 ring-white/15">
      <CardHeader className="gap-4 border-b border-white/10 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <Activity className="size-5 text-white" />
            Mercado ao vivo
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Gráfico intradiário dos ativos cadastrados na B3.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            className={
              marketData?.marketOpen
                ? 'bg-white/10 text-white'
                : 'bg-[#292d35] text-white/75'
            }
          >
            <span
              className={`mr-1.5 size-2 rounded-full ${
                marketData?.marketOpen ? 'bg-emerald-400' : 'bg-white/40'
              }`}
            />
            {marketData?.marketOpen
              ? 'Pregão aberto · 1 min'
              : 'Mercado fechado · pausado'}
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Atualizar cotações agora"
            disabled={loading}
            onClick={() => void loadMarketData()}
          >
            {loading ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <RefreshCw />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {error ? (
          <div className="flex items-start gap-2 rounded-xl bg-red-950/70 px-4 py-3 text-sm text-red-200">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-muted-foreground">
              Patrimônio acompanhado pela bolsa
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {currencyFormatter.format(livePortfolioValue)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Calculado por preço × quantidade dos ativos com ticker.
            </p>
          </div>
          <div className="space-y-2">
            <label htmlFor="live-market-ticker" className="text-sm font-medium">
              Ativo no gráfico
            </label>
            <NativeSelect
              id="live-market-ticker"
              value={selectedTicker}
              onChange={(event) => setSelectedTicker(event.target.value)}
              className="w-full"
            >
              {(marketData?.quotes ?? []).map((quote) => (
                <NativeSelectOption key={quote.ticker} value={quote.ticker}>
                  {quote.ticker} · {quote.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </div>

        {selectedQuote ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">
                  {selectedQuote.ticker} · {selectedQuote.name}
                </p>
                <p className="mt-1 text-3xl font-bold tabular-nums">
                  {currencyFormatter.format(selectedQuote.price)}
                </p>
              </div>
              <div className="text-right">
                <p
                  className={`font-bold tabular-nums ${
                    selectedQuote.changePercent >= 0
                      ? 'text-emerald-300'
                      : 'text-red-300'
                  }`}
                >
                  {selectedQuote.changePercent >= 0 ? '+' : ''}
                  {selectedQuote.changePercent.toFixed(2).replace('.', ',')}%
                </p>
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock3 className="size-3.5" />
                  Cotação das {formatQuoteTime(selectedQuote.lastUpdatedAt)}
                </p>
              </div>
            </div>

            <div
              className="h-72 w-full"
              aria-label={`Gráfico de ${selectedQuote.ticker}`}
            >
              {selectedQuote.points.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={selectedQuote.points}>
                    <CartesianGrid
                      stroke="rgba(255,255,255,.10)"
                      strokeDasharray="4 4"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(value) => formatQuoteTime(String(value))}
                      stroke="rgba(255,255,255,.45)"
                      tickLine={false}
                      axisLine={false}
                      minTickGap={28}
                    />
                    <YAxis
                      domain={['auto', 'auto']}
                      tickFormatter={(value) => Number(value).toFixed(2)}
                      stroke="rgba(255,255,255,.45)"
                      tickLine={false}
                      axisLine={false}
                      width={58}
                    />
                    <Tooltip
                      labelFormatter={(value) =>
                        `Horário: ${formatQuoteTime(String(value))}`
                      }
                      formatter={(value) => [
                        currencyFormatter.format(Number(value)),
                        'Preço',
                      ]}
                      contentStyle={{
                        backgroundColor: '#242830',
                        border: '1px solid rgba(255,255,255,.18)',
                        borderRadius: '10px',
                        color: '#ffffff',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="price"
                      stroke="#ff7557"
                      strokeWidth={3}
                      dot={false}
                      activeDot={{ r: 4, fill: '#ffffff' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="grid h-full place-items-center rounded-xl border border-dashed border-white/15 text-center text-sm text-muted-foreground">
                  O histórico intradiário aparecerá quando houver pontos de
                  negociação disponíveis.
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="grid h-72 place-items-center text-muted-foreground">
            {loading ? (
              <LoaderCircle className="size-7 animate-spin" />
            ) : (
              'Nenhuma cotação disponível para os ativos cadastrados.'
            )}
          </div>
        )}

        <p className="text-xs leading-relaxed text-muted-foreground">
          Fonte: {marketData?.provider ?? 'brapi.dev'}. A cotação pode ter
          atraso conforme o plano contratado e não representa o gráfico oficial
          do Banco Inter. A atualização de 1 minuto é pausada quando o mercado
          está fechado ou quando esta página fica em segundo plano.
        </p>
      </CardContent>
    </Card>
  );
}
