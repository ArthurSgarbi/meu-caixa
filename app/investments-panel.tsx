'use client';

import {
  ReactNode,
  SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  BriefcaseBusiness,
  CircleDollarSign,
  LoaderCircle,
  Plus,
  TrendingUp,
} from 'lucide-react';
import { Pie, PieChart, Tooltip } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';

type Investment = {
  id: number;
  name: string;
  assetClass: string;
  investedCents: number;
  currentValueCents: number;
  acquisitionDate: string;
};

type Allocation = {
  assetClass: string;
  currentValueCents: number;
};

type InvestmentData = {
  investments: Investment[];
  allocation: Allocation[];
  summary: {
    investedCents: number;
    currentValueCents: number;
    profitCents: number;
    returnPercentage: number;
  };
};

const emptyData: InvestmentData = {
  investments: [],
  allocation: [],
  summary: {
    investedCents: 0,
    currentValueCents: 0,
    profitCents: 0,
    returnPercentage: 0,
  },
};

const assetClasses = [
  'Renda fixa',
  'Ações',
  'Fundos imobiliários',
  'Criptoativos',
  'Outros',
];

const assetColors: Record<string, string> = {
  'Renda fixa': '#31d2a0',
  Ações: '#7367f0',
  'Fundos imobiliários': '#f6a94a',
  Criptoativos: '#ee6b82',
  Outros: '#7a92ad',
};

const chartConfig = {
  value: { label: 'Patrimônio atual', color: '#7367f0' },
} satisfies ChartConfig;

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatCurrency(cents: number) {
  return currencyFormatter.format(cents / 100);
}

function parseCurrencyToCents(value: string) {
  const normalized = value.includes(',')
    ? value
        .replace(/[^\d,-]/g, '')
        .replace(/\./g, '')
        .replace(',', '.')
    : value.replace(/[^\d.-]/g, '');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function formString(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value : '';
}

function localToday() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function InvestmentsPanel() {
  const [data, setData] = useState<InvestmentData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadInvestments = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/investments', { signal });
      const result = (await response.json()) as InvestmentData & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          result.error ?? 'Não foi possível carregar seus investimentos.',
        );
      }
      setData(result);
    } catch (requestError) {
      if (
        requestError instanceof DOMException &&
        requestError.name === 'AbortError'
      ) {
        return;
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível carregar seus investimentos.',
      );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void loadInvestments(controller.signal);
    });
    return () => controller.abort();
  }, [loadInvestments]);

  const chartData = useMemo(
    () =>
      data.allocation.map((item) => ({
        assetClass: item.assetClass,
        value: item.currentValueCents / 100,
        fill: assetColors[item.assetClass] ?? assetColors.Outros,
      })),
    [data.allocation],
  );

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setError('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = {
      name: formString(form.get('name')).trim(),
      assetClass: formString(form.get('assetClass')),
      investedCents: parseCurrencyToCents(
        formString(form.get('investedValue')),
      ),
      currentValueCents: parseCurrencyToCents(
        formString(form.get('currentValue')),
      ),
      acquisitionDate: formString(form.get('acquisitionDate')),
    };

    setSaving(true);
    try {
      const response = await fetch('/api/investments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(
          result.error ?? 'Não foi possível registrar o investimento.',
        );
      }
      formElement.reset();
      setMessage('Investimento adicionado à sua carteira.');
      await loadInvestments();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível registrar o investimento.',
      );
    } finally {
      setSaving(false);
    }
  }

  const profitIsPositive = data.summary.profitCents >= 0;

  return (
    <section className="min-h-[calc(100vh-81px)] bg-[#f6f7fb] pb-16">
      <header className="investment-grid bg-[#171640] text-white">
        <div className="mx-auto max-w-7xl px-5 pb-12 pt-9 sm:px-8 lg:px-10">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-1 text-sm font-medium text-[#aca5ff]">
                Carteira de investimentos
              </p>
              <h1 className="text-3xl font-bold tracking-[-0.045em] sm:text-4xl">
                Seu patrimônio em um só lugar
              </h1>
            </div>
            <Badge className="border border-violet-300/20 bg-violet-300/10 text-violet-100">
              Atualização manual
            </Badge>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <InvestmentSummary
              label="Total aplicado"
              value={formatCurrency(data.summary.investedCents)}
              icon={<CircleDollarSign />}
              loading={loading}
            />
            <InvestmentSummary
              label="Patrimônio atual"
              value={formatCurrency(data.summary.currentValueCents)}
              icon={<BriefcaseBusiness />}
              loading={loading}
              featured
            />
            <InvestmentSummary
              label="Resultado acumulado"
              value={`${profitIsPositive ? '+' : '−'} ${formatCurrency(
                Math.abs(data.summary.profitCents),
              )}`}
              detail={`${profitIsPositive ? '+' : ''}${data.summary.returnPercentage.toFixed(2).replace('.', ',')}%`}
              icon={profitIsPositive ? <ArrowUpRight /> : <ArrowDownRight />}
              loading={loading}
              positive={profitIsPositive}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-5 pt-8 sm:px-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:px-10">
        <Card className="h-fit border-0 shadow-[0_18px_50px_rgba(23,22,64,.09)] ring-1 ring-violet-100">
          <CardHeader className="border-b border-violet-50 pb-4">
            <CardTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
              <span className="grid size-8 place-items-center rounded-lg bg-violet-100 text-violet-700">
                <Plus className="size-4" />
              </span>
              Novo investimento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="investment-name">Nome do ativo</Label>
                <Input
                  id="investment-name"
                  name="name"
                  required
                  minLength={2}
                  maxLength={80}
                  placeholder="Ex.: Tesouro Selic 2029"
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="asset-class">Classe</Label>
                <NativeSelect
                  id="asset-class"
                  name="assetClass"
                  className="w-full"
                >
                  {assetClasses.map((assetClass) => (
                    <NativeSelectOption key={assetClass} value={assetClass}>
                      {assetClass}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="invested-value">Valor aplicado</Label>
                  <Input
                    id="invested-value"
                    name="investedValue"
                    required
                    inputMode="decimal"
                    placeholder="R$ 0,00"
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="current-value">Valor atual</Label>
                  <Input
                    id="current-value"
                    name="currentValue"
                    required
                    inputMode="decimal"
                    placeholder="R$ 0,00"
                    className="h-11"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="acquisition-date">Data da aplicação</Label>
                <Input
                  id="acquisition-date"
                  name="acquisitionDate"
                  type="date"
                  required
                  defaultValue={localToday()}
                  className="h-11"
                />
              </div>

              {(message || error) && (
                <output
                  aria-live="polite"
                  className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${
                    error
                      ? 'bg-red-50 text-red-700'
                      : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {error && <AlertCircle className="mt-0.5 size-4 shrink-0" />}
                  {error || message}
                </output>
              )}

              <Button
                type="submit"
                size="lg"
                disabled={saving || loading}
                className="h-11 w-full bg-violet-700 font-semibold text-white hover:bg-violet-600"
              >
                {saving ? <LoaderCircle className="animate-spin" /> : <Plus />}
                {saving ? 'Adicionando...' : 'Adicionar investimento'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(300px,.8fr)]">
          <Card className="border-0 shadow-[0_18px_50px_rgba(23,22,64,.07)] ring-1 ring-violet-100">
            <CardHeader className="border-b border-violet-50 pb-4">
              <CardTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
                <BarChart3 className="size-5 text-violet-600" />
                Distribuição da carteira
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Participação de cada classe no patrimônio atual
              </p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="grid h-72 place-items-center text-muted-foreground">
                  <LoaderCircle className="size-7 animate-spin" />
                </div>
              ) : chartData.length === 0 ? (
                <div className="grid h-72 place-items-center px-6 text-center">
                  <div>
                    <span className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-violet-50 text-violet-500">
                      <BarChart3 />
                    </span>
                    <p className="font-semibold">
                      Sua distribuição aparecerá aqui
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Adicione um investimento para montar o gráfico.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <ChartContainer
                    config={chartConfig}
                    className="mx-auto h-[250px] w-full max-w-sm"
                  >
                    <PieChart accessibilityLayer>
                      <Tooltip
                        formatter={(value) =>
                          currencyFormatter.format(Number(value))
                        }
                      />
                      <Pie
                        data={chartData}
                        dataKey="value"
                        nameKey="assetClass"
                        innerRadius={62}
                        outerRadius={96}
                        paddingAngle={3}
                        strokeWidth={0}
                      />
                    </PieChart>
                  </ChartContainer>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {data.allocation.map((item) => {
                      const percentage =
                        data.summary.currentValueCents > 0
                          ? (item.currentValueCents /
                              data.summary.currentValueCents) *
                            100
                          : 0;
                      return (
                        <div
                          key={item.assetClass}
                          className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              className="size-2.5 shrink-0 rounded-full"
                              style={{
                                backgroundColor:
                                  assetColors[item.assetClass] ??
                                  assetColors.Outros,
                              }}
                            />
                            <span className="truncate text-sm">
                              {item.assetClass}
                            </span>
                          </span>
                          <span className="text-sm font-semibold tabular-nums">
                            {percentage.toFixed(0)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-[0_18px_50px_rgba(23,22,64,.07)] ring-1 ring-violet-100">
            <CardHeader className="border-b border-violet-50 pb-4">
              <CardTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
                <TrendingUp className="size-5 text-violet-600" />
                Seus ativos
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {data.investments.length}{' '}
                {data.investments.length === 1
                  ? 'investimento cadastrado'
                  : 'investimentos cadastrados'}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <div className="grid h-64 place-items-center text-muted-foreground">
                  <LoaderCircle className="size-7 animate-spin" />
                </div>
              ) : data.investments.length === 0 ? (
                <div className="grid h-64 place-items-center px-4 text-center">
                  <div>
                    <BriefcaseBusiness className="mx-auto mb-3 size-9 text-violet-400" />
                    <p className="font-semibold">Carteira vazia</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Cadastre seu primeiro ativo ao lado.
                    </p>
                  </div>
                </div>
              ) : (
                data.investments.map((investment) => {
                  const result =
                    investment.currentValueCents - investment.investedCents;
                  return (
                    <article
                      key={investment.id}
                      className="rounded-xl border border-slate-100 bg-white p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate font-semibold">
                            {investment.name}
                          </h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {investment.assetClass} ·{' '}
                            {dateFormatter.format(
                              new Date(
                                `${investment.acquisitionDate}T00:00:00Z`,
                              ),
                            )}
                          </p>
                        </div>
                        <Badge
                          className={
                            result >= 0
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-red-50 text-red-700'
                          }
                        >
                          {result >= 0 ? '+' : '−'}{' '}
                          {formatCurrency(Math.abs(result))}
                        </Badge>
                      </div>
                      <div className="mt-4 flex items-end justify-between gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Valor atual
                          </p>
                          <p className="mt-0.5 text-lg font-bold tabular-nums">
                            {formatCurrency(investment.currentValueCents)}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          Aplicado: {formatCurrency(investment.investedCents)}
                        </p>
                      </div>
                    </article>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

function InvestmentSummary({
  label,
  value,
  detail,
  icon,
  loading,
  featured = false,
  positive = true,
}: {
  label: string;
  value: string;
  detail?: string;
  icon: ReactNode;
  loading: boolean;
  featured?: boolean;
  positive?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 backdrop-blur-sm ${
        featured
          ? 'border-violet-300/35 bg-violet-300/15'
          : 'border-white/10 bg-white/[.07]'
      }`}
    >
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-medium text-violet-100/80">{label}</p>
        <span
          className={`[&_svg]:size-5 ${positive ? 'text-[#7ee9c5]' : 'text-red-300'}`}
        >
          {icon}
        </span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <p
          className={`text-2xl font-bold tracking-[-0.035em] text-white tabular-nums ${loading ? 'animate-pulse opacity-50' : ''}`}
        >
          {loading ? 'R$ —' : value}
        </p>
        {detail && !loading && (
          <span
            className={`text-sm font-semibold tabular-nums ${
              positive ? 'text-[#7ee9c5]' : 'text-red-300'
            }`}
          >
            {detail}
          </span>
        )}
      </div>
    </div>
  );
}
