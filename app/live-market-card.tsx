'use client';
import { useMoneyFormatter, usePreferences } from './preferences-provider';
import { apiFetch, readApiJson } from '@/lib/client-api';
import { useLatestRequest } from '@/hooks/use-latest-request';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
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
  const formatCurrency = useMoneyFormatter();
  const { preferences, motionReduced } = usePreferences();
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [selectedTicker, setSelectedTicker] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const beginMarketRequest = useLatestRequest();

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

  const loadMarketData = useCallback(
    async (signal?: AbortSignal) => {
      signal = beginMarketRequest(signal).signal;
      if (signal.aborted) return false;
      setLoading(true);
      try {
        const response = await apiFetch('/api/market-data', {
          cache: 'no-store',
          signal,
        });
        const result = (await readApiJson(response)) as MarketResponse;
        if (!response.ok) {
          throw new Error(
            result.error ?? 'Não foi possível carregar as cotações.',
          );
        }

        const nextData = result as MarketData;
        if (!Array.isArray(nextData.quotes))
          throw new Error(
            'As cotações recebidas são inválidas. Tente novamente.',
          );
        if (signal.aborted) return false;
        setMarketData(nextData);
        setSelectedTicker((current) =>
          nextData.quotes.some((quote) => quote.ticker === current)
            ? current
            : (nextData.quotes[0]?.ticker ?? ''),
        );
        setError('');
        return nextData.marketOpen;
      } catch (requestError) {
        if (signal.aborted) return false;
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
    },
    [beginMarketRequest],
  );

  useEffect(() => {
    if (!assetKey) {
      return;
    }

    const controller = new AbortController();
    let timer: number | undefined;
    let refreshing = false;

    const scheduleRefresh = async () => {
      if (document.hidden || controller.signal.aborted || refreshing) return;
      refreshing = true;
      const marketOpen = await loadMarketData(controller.signal);
      refreshing = false;
      if (
        controller.signal.aborted ||
        document.hidden ||
        !preferences.marketAutoRefresh
      )
        return;
      timer = window.setTimeout(
        scheduleRefresh,
        marketOpen ? 60_000 : 15 * 60_000,
      );
    };

    const handleVisibilityChange = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      if (!document.hidden && preferences.marketAutoRefresh)
        void scheduleRefresh();
    };

    queueMicrotask(() => void scheduleRefresh());
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [assetKey, loadMarketData, refreshVersion, preferences.marketAutoRefresh]);

  const quotes = useMemo(
    () =>
      (marketData?.quotes ?? []).filter((quote) =>
        quantities.has(quote.ticker),
      ),
    [marketData?.quotes, quantities],
  );
  const selectedQuote =
    quotes.find((quote) => quote.ticker === selectedTicker) ?? quotes[0];
  const selectedQuoteIndex = quotes.findIndex(
    (quote) => quote.ticker === selectedQuote?.ticker,
  );

  const moveCarousel = (direction: -1 | 1) => {
    if (quotes.length === 0) return;
    const currentIndex = selectedQuoteIndex >= 0 ? selectedQuoteIndex : 0;
    const nextIndex =
      (currentIndex + direction + quotes.length) % quotes.length;
    setSelectedTicker(quotes[nextIndex].ticker);
  };
  const livePortfolioValue = useMemo(
    () =>
      quotes.reduce(
        (total, quote) =>
          total + quote.price * (quantities.get(quote.ticker) ?? 0),
        0,
      ),
    [quotes, quantities],
  );

  if (assets.length === 0) {
    return (
      <Card className="border-0 shadow-[0_18px_50px_rgba(0,0,0,.2)] ring-1 ring-foreground/15">
        <CardHeader className="border-b border-foreground/10 pb-4">
          <CardTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <Activity className="size-5 text-foreground" />
            Mercado ao vivo
          </CardTitle>
        </CardHeader>
        <CardContent className="py-10 text-center">
          <Activity className="mx-auto mb-3 size-9 text-foreground/70" />
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
    <Card className="border-0 shadow-[0_18px_50px_rgba(0,0,0,.2)] ring-1 ring-foreground/15">
      <CardHeader className="gap-4 border-b border-foreground/10 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <Activity className="size-5 text-foreground" />
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
                ? 'bg-inverse/10 text-foreground'
                : 'bg-card text-foreground/75'
            }
          >
            <span
              className={`mr-1.5 size-2 rounded-full ${
                marketData?.marketOpen ? 'bg-emerald-400' : 'bg-inverse/40'
              }`}
            />
            {!marketData
              ? 'Consultando pregão...'
              : marketData.marketOpen
                ? preferences.marketAutoRefresh
                  ? 'Pregão aberto · 1 min'
                  : 'Pregão aberto · manual'
                : 'Mercado fechado · pausado'}
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Atualizar cotações agora"
            disabled={loading}
            onClick={() => setRefreshVersion((version) => version + 1)}
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
          <div className="flex items-start gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
          <div className="rounded-xl border border-foreground/10 bg-inverse/5 p-4">
            <p className="text-xs text-muted-foreground">
              Patrimônio acompanhado pela bolsa
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {quotes.length ? formatCurrency(livePortfolioValue * 100) : '—'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Calculado por preço × quantidade dos ativos com ticker.
              {quotes.length < quantities.size &&
                ` Cotação disponível para ${quotes.length} de ${quantities.size} ativos.`}
            </p>
          </div>
          <div className="space-y-2">
            <label htmlFor="live-market-ticker" className="text-sm font-medium">
              Ativo no gráfico
            </label>
            <NativeSelect
              id="live-market-ticker"
              value={selectedQuote?.ticker ?? ''}
              disabled={!quotes.length}
              onChange={(event) => setSelectedTicker(event.target.value)}
              className="w-full"
            >
              {quotes.map((quote) => (
                <NativeSelectOption key={quote.ticker} value={quote.ticker}>
                  {quote.ticker} · {quote.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </div>

        {quotes.length ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-foreground/10 bg-inverse/5 px-3 py-2">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Ver ação anterior"
              onClick={() => moveCarousel(-1)}
              disabled={quotes.length < 2}
            >
              <ChevronLeft />
            </Button>
            <div
              className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-1.5"
              aria-label="Navegação dos gráficos por ação"
            >
              {quotes.map((quote, index) => (
                <button
                  key={quote.ticker}
                  type="button"
                  aria-label={`Ver gráfico de ${quote.ticker}`}
                  aria-current={
                    index === selectedQuoteIndex ? 'true' : undefined
                  }
                  onClick={() => setSelectedTicker(quote.ticker)}
                  className={`h-2 rounded-full transition-all ${
                    index === selectedQuoteIndex
                      ? 'w-7 bg-primary'
                      : 'w-2 bg-inverse/30 hover:bg-inverse/60'
                  }`}
                />
              ))}
            </div>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {selectedQuoteIndex + 1}/{quotes.length}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Ver próxima ação"
              onClick={() => moveCarousel(1)}
              disabled={quotes.length < 2}
            >
              <ChevronRight />
            </Button>
          </div>
        ) : null}

        {selectedQuote ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">
                  {selectedQuote.ticker} · {selectedQuote.name}
                </p>
                <p className="mt-1 text-3xl font-bold tabular-nums">
                  {formatCurrency(selectedQuote.price * 100)}
                </p>
              </div>
              <div className="text-right">
                <p
                  className={`font-bold tabular-nums ${
                    selectedQuote.changePercent >= 0
                      ? 'text-emerald-300'
                      : 'text-destructive'
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
              data-private-chart="true"
              className="h-72 w-full"
              aria-label={`Gráfico de ${selectedQuote.ticker}`}
            >
              {selectedQuote.points.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={selectedQuote.points}>
                    <CartesianGrid
                      stroke="var(--border)"
                      strokeDasharray="4 4"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(value) => formatQuoteTime(String(value))}
                      stroke="var(--muted-foreground)"
                      tickLine={false}
                      axisLine={false}
                      minTickGap={28}
                    />
                    <YAxis
                      domain={['auto', 'auto']}
                      tickFormatter={(value) => Number(value).toFixed(2)}
                      stroke="var(--muted-foreground)"
                      tickLine={false}
                      axisLine={false}
                      width={58}
                    />
                    <Tooltip
                      labelFormatter={(value) =>
                        `Horário: ${formatQuoteTime(String(value))}`
                      }
                      formatter={(value) => [
                        formatCurrency(Number(value) * 100),
                        'Preço',
                      ]}
                      contentStyle={{
                        backgroundColor: 'var(--popover)',
                        border: '1px solid var(--border)',
                        borderRadius: '10px',
                        color: 'var(--foreground)',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="price"
                      stroke="var(--chart-1)"
                      isAnimationActive={!motionReduced}
                      strokeWidth={3}
                      dot={false}
                      activeDot={{ r: 4, fill: 'var(--foreground)' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="grid h-full place-items-center rounded-xl border border-dashed border-foreground/15 text-center text-sm text-muted-foreground">
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
          do Banco Inter.{' '}
          {preferences.marketAutoRefresh
            ? 'A atualização de 1 minuto é pausada quando o mercado está fechado ou a página fica em segundo plano.'
            : 'Atualização automática desativada nas configurações; use o botão de atualizar.'}
        </p>
      </CardContent>
    </Card>
  );
}
