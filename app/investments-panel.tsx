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
  Calculator,
  CircleDollarSign,
  History,
  Landmark,
  LoaderCircle,
  Pencil,
  Plus,
  Save,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { Pie, PieChart, Tooltip } from 'recharts';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { calculateDailyYield } from '@/lib/investment-calculations';
import { LiveMarketCard } from './live-market-card';

type Investment = {
  id: number;
  name: string;
  assetClass: string;
  investedCents: number;
  currentValueCents: number;
  ticker: string | null;
  quantity: number | null;
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

type Contribution = {
  id: number;
  description: string;
  amountCents: number;
  contributionDate: string;
};

type InvestmentWalletData = {
  wallet: {
    balanceCents: number;
    annualCdiRate: number;
    cdbPercentage: number;
    effectiveAnnualRatePercent: number;
    dailyRate: number;
    dailyYieldCents: number;
  };
  mainBalanceCents: number;
  contributions: Contribution[];
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

const emptyWalletData: InvestmentWalletData = {
  wallet: {
    balanceCents: 0,
    annualCdiRate: 10.5,
    cdbPercentage: 100,
    effectiveAnnualRatePercent: 10.5,
    dailyRate: 0,
    dailyYieldCents: 0,
  },
  mainBalanceCents: 0,
  contributions: [],
};

const assetClasses = [
  'Renda fixa',
  'Ações',
  'Fundos imobiliários',
  'Criptoativos',
  'Outros',
];

const assetColors: Record<string, string> = {
  'Renda fixa': '#ffffff',
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

function formatCurrencyInput(cents: number) {
  return (cents / 100).toFixed(2).replace('.', ',');
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

function parsePercentage(value: string) {
  const parsed = Number(value.trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDecimal(value: string) {
  const parsed = Number(value.trim().replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
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
  const [editingInvestment, setEditingInvestment] = useState<Investment | null>(
    null,
  );
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [deletingInvestment, setDeletingInvestment] =
    useState<Investment | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [walletData, setWalletData] =
    useState<InvestmentWalletData>(emptyWalletData);
  const [walletLoading, setWalletLoading] = useState(true);
  const [walletSaving, setWalletSaving] = useState(false);
  const [walletMessage, setWalletMessage] = useState('');
  const [walletError, setWalletError] = useState('');
  const [annualCdiRate, setAnnualCdiRate] = useState('10,50');
  const [cdbPercentage, setCdbPercentage] = useState('100');

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

  const loadWallet = useCallback(async (signal?: AbortSignal) => {
    setWalletLoading(true);
    setWalletError('');
    try {
      const response = await fetch('/api/investment-wallet', { signal });
      const result = (await response.json()) as InvestmentWalletData & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          result.error ?? 'Não foi possível carregar seu saldo investido.',
        );
      }
      setWalletData(result);
      setAnnualCdiRate(
        result.wallet.annualCdiRate.toFixed(2).replace('.', ','),
      );
      setCdbPercentage(
        result.wallet.cdbPercentage
          .toFixed(2)
          .replace(/\.00$/, '')
          .replace('.', ','),
      );
    } catch (requestError) {
      if (
        requestError instanceof DOMException &&
        requestError.name === 'AbortError'
      ) {
        return;
      }
      setWalletError(
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível carregar seu saldo investido.',
      );
    } finally {
      if (!signal?.aborted) setWalletLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void loadInvestments(controller.signal);
    });
    return () => controller.abort();
  }, [loadInvestments]);

  useEffect(() => {
    const controller = new AbortController();
    const refreshWallet = () => void loadWallet();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void loadWallet(controller.signal);
    });
    window.addEventListener('investment-wallet-updated', refreshWallet);
    return () => {
      controller.abort();
      window.removeEventListener('investment-wallet-updated', refreshWallet);
    };
  }, [loadWallet]);

  const chartData = useMemo(
    () =>
      data.allocation.map((item) => ({
        assetClass: item.assetClass,
        value: item.currentValueCents / 100,
        fill: assetColors[item.assetClass] ?? assetColors.Outros,
      })),
    [data.allocation],
  );

  const liveDailyYield = useMemo(
    () =>
      calculateDailyYield(
        walletData.wallet.balanceCents,
        parsePercentage(annualCdiRate),
        parsePercentage(cdbPercentage),
      ),
    [annualCdiRate, cdbPercentage, walletData.wallet.balanceCents],
  );

  async function handleRateSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setWalletSaving(true);
    setWalletError('');
    setWalletMessage('');
    try {
      const response = await fetch('/api/investment-wallet', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          annualCdiRate: parsePercentage(annualCdiRate),
          cdbPercentage: parsePercentage(cdbPercentage),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? 'Não foi possível salvar as taxas.');
      }
      setWalletMessage('Taxas salvas. O rendimento diário foi recalculado.');
      await loadWallet();
    } catch (requestError) {
      setWalletError(
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível salvar as taxas.',
      );
    } finally {
      setWalletSaving(false);
    }
  }

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
      ticker: formString(form.get('ticker')).trim().toUpperCase(),
      quantity: parseDecimal(formString(form.get('quantity'))),
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

  async function handleEditSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingInvestment) return;

    const form = new FormData(event.currentTarget);
    const payload = {
      id: editingInvestment.id,
      name: formString(form.get('editInvestmentName')).trim(),
      assetClass: formString(form.get('editAssetClass')),
      investedCents: parseCurrencyToCents(
        formString(form.get('editInvestedValue')),
      ),
      currentValueCents: parseCurrencyToCents(
        formString(form.get('editCurrentValue')),
      ),
      ticker: formString(form.get('editTicker')).trim().toUpperCase(),
      quantity: parseDecimal(formString(form.get('editQuantity'))),
      acquisitionDate: formString(form.get('editAcquisitionDate')),
    };

    setEditSaving(true);
    setEditError('');
    try {
      const response = await fetch('/api/investments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(
          result.error ??
            'Não foi possível salvar as alterações do investimento.',
        );
      }
      setEditingInvestment(null);
      setMessage('Alterações do investimento salvas no banco de dados.');
      setError('');
      await loadInvestments();
    } catch (requestError) {
      setEditError(
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível salvar as alterações do investimento.',
      );
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDeleteInvestment() {
    if (!deletingInvestment) return;

    setDeleteSaving(true);
    setDeleteError('');
    try {
      const response = await fetch('/api/investments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deletingInvestment.id }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(
          result.error ?? 'Não foi possível remover o investimento.',
        );
      }

      const removedName = deletingInvestment.name;
      setDeletingInvestment(null);
      setMessage(`${removedName} foi removido da sua carteira.`);
      setError('');
      await loadInvestments();
    } catch (requestError) {
      setDeleteError(
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível remover o investimento.',
      );
    } finally {
      setDeleteSaving(false);
    }
  }

  const profitIsPositive = data.summary.profitCents >= 0;
  const trackedAssets = useMemo(
    () =>
      data.investments.flatMap((investment) =>
        investment.ticker && investment.quantity && investment.quantity > 0
          ? [
              {
                id: investment.id,
                name: investment.name,
                ticker: investment.ticker,
                quantity: investment.quantity,
              },
            ]
          : [],
      ),
    [data.investments],
  );

  return (
    <section className="min-h-[calc(100vh-81px)] pb-16">
      <header className="text-white">
        <div className="mx-auto max-w-7xl px-5 pb-12 pt-9 sm:px-8 lg:px-10">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-1 text-sm font-medium text-white">
                Carteira de investimentos
              </p>
              <h1 className="text-3xl font-bold tracking-[-0.045em] sm:text-4xl">
                Seu patrimônio em um só lugar
              </h1>
            </div>
            <Badge className="border border-white/15 bg-[#292d35]/80 text-white">
              CDI/CDB · 252 dias úteis
            </Badge>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <InvestmentSummary
              label="Saldo da conta"
              value={formatCurrency(walletData.mainBalanceCents)}
              detail="Disponível para investir"
              icon={<Landmark />}
              loading={walletLoading}
            />
            <InvestmentSummary
              label="Saldo investido"
              value={formatCurrency(walletData.wallet.balanceCents)}
              icon={<BriefcaseBusiness />}
              loading={walletLoading}
              featured
            />
            <InvestmentSummary
              label="Rendimento do dia"
              value={`+ ${formatCurrency(liveDailyYield.dailyYieldCents)}`}
              detail={`${(liveDailyYield.dailyRate * 100).toFixed(4).replace('.', ',')}% ao dia`}
              icon={<TrendingUp />}
              loading={walletLoading}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-5 pt-8 sm:px-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,.95fr)] lg:px-10">
        <Card className="border-0 shadow-[0_18px_50px_rgba(0,0,0,.22)] ring-1 ring-white/15">
          <CardHeader className="border-b border-white/10 pb-4">
            <CardTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
              <Calculator className="size-5 text-white" />
              Calculador de rendimento diário
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Simulação bruta com capitalização composta e 252 dias úteis.
            </p>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={handleRateSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="annual-cdi-rate">Taxa anual do CDI (%)</Label>
                  <Input
                    id="annual-cdi-rate"
                    inputMode="decimal"
                    required
                    value={annualCdiRate}
                    onChange={(event) => setAnnualCdiRate(event.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cdb-percentage">CDB (% do CDI)</Label>
                  <Input
                    id="cdb-percentage"
                    inputMode="decimal"
                    required
                    value={cdbPercentage}
                    onChange={(event) => setCdbPercentage(event.target.value)}
                    className="h-11"
                  />
                </div>
              </div>

              <div className="grid gap-3 rounded-xl border border-white/10 bg-white/5 p-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">
                    Taxa efetiva anual
                  </p>
                  <p className="mt-1 font-bold tabular-nums">
                    {liveDailyYield.effectiveAnnualRatePercent
                      .toFixed(2)
                      .replace('.', ',')}
                    %
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Taxa diária</p>
                  <p className="mt-1 font-bold tabular-nums">
                    {(liveDailyYield.dailyRate * 100)
                      .toFixed(6)
                      .replace('.', ',')}
                    %
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Rende hoje</p>
                  <p className="mt-1 font-bold text-white tabular-nums">
                    {formatCurrency(liveDailyYield.dailyYieldCents)}
                  </p>
                </div>
              </div>

              {(walletMessage || walletError) && (
                <output
                  aria-live="polite"
                  className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${
                    walletError
                      ? 'bg-red-950/70 text-red-200'
                      : 'bg-white/10 text-white'
                  }`}
                >
                  {walletError && (
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  )}
                  {walletError || walletMessage}
                </output>
              )}

              <Button
                type="submit"
                disabled={walletSaving || walletLoading}
                className="bg-[#f4513e] font-semibold text-white hover:bg-[#e83232]"
              >
                {walletSaving ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Save />
                )}
                {walletSaving ? 'Salvando...' : 'Salvar taxas'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-[0_18px_50px_rgba(0,0,0,.22)] ring-1 ring-white/15">
          <CardHeader className="border-b border-white/10 pb-4">
            <CardTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
              <History className="size-5 text-white" />
              Histórico de aportes
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Últimas transferências da conta para os investimentos.
            </p>
          </CardHeader>
          <CardContent className="max-h-[350px] space-y-3 overflow-y-auto">
            {walletLoading ? (
              <div className="grid h-40 place-items-center text-muted-foreground">
                <LoaderCircle className="size-7 animate-spin" />
              </div>
            ) : walletData.contributions.length === 0 ? (
              <div className="grid h-40 place-items-center px-4 text-center">
                <div>
                  <History className="mx-auto mb-3 size-8 text-white/70" />
                  <p className="font-semibold">Nenhum aporte registrado</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Use “Novo investimento” na área de Gastos.
                  </p>
                </div>
              </div>
            ) : (
              walletData.contributions.map((contribution) => (
                <article
                  key={contribution.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {contribution.description}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {dateFormatter.format(
                        new Date(`${contribution.contributionDate}T00:00:00Z`),
                      )}
                    </p>
                  </div>
                  <p className="shrink-0 font-bold text-white tabular-nums">
                    + {formatCurrency(contribution.amountCents)}
                  </p>
                </article>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mx-auto max-w-7xl px-5 pt-8 sm:px-8 lg:px-10">
        <div className="mb-4">
          <p className="text-sm font-medium text-white/75">
            Carteira de ativos
          </p>
          <h2 className="text-2xl font-bold tracking-tight">
            Acompanhe a composição do patrimônio
          </h2>
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

      <div className="mx-auto max-w-7xl px-5 pt-8 sm:px-8 lg:px-10">
        <LiveMarketCard assets={trackedAssets} />
      </div>

      <div className="mx-auto grid max-w-7xl gap-6 px-5 pt-8 sm:px-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:px-10">
        <Card className="h-fit border-0 shadow-[0_18px_50px_rgba(0,0,0,.22)] ring-1 ring-white/15">
          <CardHeader className="border-b border-white/10 pb-4">
            <CardTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
              <span className="grid size-8 place-items-center rounded-lg bg-white text-black">
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
                  <Label htmlFor="investment-ticker">
                    Código B3{' '}
                    <span className="text-muted-foreground">(opcional)</span>
                  </Label>
                  <Input
                    id="investment-ticker"
                    name="ticker"
                    autoCapitalize="characters"
                    maxLength={12}
                    placeholder="Ex.: PETR4"
                    className="h-11 uppercase"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="investment-quantity">
                    Quantidade{' '}
                    <span className="text-muted-foreground">(opcional)</span>
                  </Label>
                  <Input
                    id="investment-quantity"
                    name="quantity"
                    inputMode="decimal"
                    placeholder="Ex.: 100"
                    className="h-11"
                  />
                </div>
              </div>
              <p className="-mt-3 text-xs leading-relaxed text-muted-foreground">
                Preencha os dois campos para ativar o gráfico de mercado. Não
                use esses campos para CDB, Tesouro ou outros ativos sem ticker.
              </p>

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
                      ? 'bg-red-950/70 text-red-200'
                      : 'bg-white/10 text-white'
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
                className="h-11 w-full bg-[#f4513e] font-semibold text-white hover:bg-[#e83232]"
              >
                {saving ? <LoaderCircle className="animate-spin" /> : <Plus />}
                {saving ? 'Adicionando...' : 'Adicionar investimento'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(300px,.8fr)]">
          <Card className="border-0 shadow-[0_18px_50px_rgba(0,0,0,.2)] ring-1 ring-white/15">
            <CardHeader className="border-b border-white/10 pb-4">
              <CardTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
                <BarChart3 className="size-5 text-white" />
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
                    <span className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-white/10 text-white">
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
                        contentStyle={{
                          backgroundColor: '#242830',
                          border: '1px solid rgba(255,255,255,.18)',
                          borderRadius: '10px',
                          color: '#ffffff',
                        }}
                        itemStyle={{ color: '#ffffff' }}
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
                          className="flex items-center justify-between gap-3 rounded-lg bg-white/10 px-3 py-2"
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

          <Card className="border-0 shadow-[0_18px_50px_rgba(0,0,0,.2)] ring-1 ring-white/15">
            <CardHeader className="border-b border-white/10 pb-4">
              <CardTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
                <TrendingUp className="size-5 text-white" />
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
                    <BriefcaseBusiness className="mx-auto mb-3 size-9 text-white/70" />
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
                      className="rounded-xl border border-white/10 bg-[#242830] p-4"
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
                          {investment.ticker && investment.quantity ? (
                            <p className="mt-1 text-xs font-medium text-white/75">
                              {investment.ticker} ·{' '}
                              {investment.quantity.toLocaleString('pt-BR')}{' '}
                              unidades
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Badge
                            className={
                              result >= 0
                                ? 'bg-white/10 text-white'
                                : 'bg-red-950/70 text-red-200'
                            }
                          >
                            {result >= 0 ? '+' : '−'}{' '}
                            {formatCurrency(Math.abs(result))}
                          </Badge>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Editar ${investment.name}`}
                            onClick={() => {
                              setEditingInvestment(investment);
                              setEditError('');
                            }}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remover ${investment.name}`}
                            className="text-red-300 hover:bg-red-950/70 hover:text-red-100"
                            onClick={() => {
                              setDeletingInvestment(investment);
                              setDeleteError('');
                            }}
                          >
                            <Trash2 />
                          </Button>
                        </div>
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

      <Dialog
        open={editingInvestment !== null}
        onOpenChange={(open) => {
          if (!open && !editSaving) setEditingInvestment(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar investimento</DialogTitle>
            <DialogDescription>
              O patrimônio, o resultado e o gráfico serão recalculados ao
              salvar.
            </DialogDescription>
          </DialogHeader>
          {editingInvestment && (
            <form
              key={editingInvestment.id}
              className="space-y-4"
              onSubmit={handleEditSubmit}
            >
              <div className="space-y-2">
                <Label htmlFor="edit-investment-name">Nome do ativo</Label>
                <Input
                  id="edit-investment-name"
                  name="editInvestmentName"
                  required
                  minLength={2}
                  maxLength={80}
                  defaultValue={editingInvestment.name}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-asset-class">Classe</Label>
                <NativeSelect
                  id="edit-asset-class"
                  name="editAssetClass"
                  defaultValue={editingInvestment.assetClass}
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
                  <Label htmlFor="edit-investment-ticker">Código B3</Label>
                  <Input
                    id="edit-investment-ticker"
                    name="editTicker"
                    autoCapitalize="characters"
                    maxLength={12}
                    placeholder="Ex.: MXRF11"
                    defaultValue={editingInvestment.ticker ?? ''}
                    className="h-11 uppercase"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-investment-quantity">Quantidade</Label>
                  <Input
                    id="edit-investment-quantity"
                    name="editQuantity"
                    inputMode="decimal"
                    placeholder="Ex.: 100"
                    defaultValue={editingInvestment.quantity ?? ''}
                    className="h-11"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="edit-invested-value">Valor aplicado</Label>
                  <Input
                    id="edit-invested-value"
                    name="editInvestedValue"
                    required
                    inputMode="decimal"
                    defaultValue={formatCurrencyInput(
                      editingInvestment.investedCents,
                    )}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-current-value">Valor atual</Label>
                  <Input
                    id="edit-current-value"
                    name="editCurrentValue"
                    required
                    inputMode="decimal"
                    defaultValue={formatCurrencyInput(
                      editingInvestment.currentValueCents,
                    )}
                    className="h-11"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-acquisition-date">Data da aplicação</Label>
                <Input
                  id="edit-acquisition-date"
                  name="editAcquisitionDate"
                  type="date"
                  required
                  defaultValue={editingInvestment.acquisitionDate}
                  className="h-11"
                />
              </div>

              {editError && (
                <output
                  aria-live="polite"
                  className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  {editError}
                </output>
              )}

              <DialogFooter className="mx-0 mb-0 -mr-4 -ml-4">
                <Button
                  type="button"
                  variant="outline"
                  disabled={editSaving}
                  onClick={() => setEditingInvestment(null)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={editSaving}
                  className="bg-[#f4513e] text-white hover:bg-[#e83232]"
                >
                  {editSaving && <LoaderCircle className="animate-spin" />}
                  {editSaving ? 'Salvando...' : 'Salvar alterações'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deletingInvestment !== null}
        onOpenChange={(open) => {
          if (!open && !deleteSaving) {
            setDeletingInvestment(null);
            setDeleteError('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover investimento?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingInvestment
                ? `${deletingInvestment.name} será removido da carteira e dos gráficos. Esta ação não altera o histórico de aportes.`
                : 'O investimento selecionado será removido da carteira.'}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {deleteError && (
            <output
              aria-live="polite"
              className="flex items-start gap-2 rounded-lg bg-red-950/70 px-3 py-2.5 text-sm text-red-200"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {deleteError}
            </output>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSaving}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              disabled={deleteSaving}
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => void handleDeleteInvestment()}
            >
              {deleteSaving && <LoaderCircle className="animate-spin" />}
              {deleteSaving ? 'Removendo...' : 'Sim, remover'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
          ? 'border-white/30 bg-white/10'
          : 'border-white/15 bg-[#292d35]/80'
      }`}
    >
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-medium text-white/80">{label}</p>
        <span
          className={`[&_svg]:size-5 ${positive ? 'text-white' : 'text-red-200'}`}
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
              positive ? 'text-white' : 'text-red-200'
            }`}
          >
            {detail}
          </span>
        )}
      </div>
    </div>
  );
}
