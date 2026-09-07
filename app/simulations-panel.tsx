'use client';

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Chart as ChartInstance } from 'chart.js';
import {
  AlertCircle,
  CreditCard,
  FolderHeart,
  LoaderCircle,
  PiggyBank,
  Save,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  type SimulationPoint,
  simulateDebt,
  simulateInvestment,
} from '@/lib/simulation-calculations';

type SimulationType = 'debt' | 'investment';
type DurationUnit = 'months' | 'years';

type SavedSimulation = {
  id: number;
  name: string;
  simulationType: SimulationType;
  input: Record<string, unknown>;
  result: Record<string, unknown>;
  updatedAt: string;
};

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
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
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : 0;
}

function parsePercentage(value: string) {
  const parsed = Number(value.trim().replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function parsePositiveInteger(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function numberFrom(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function SimulationsPanel() {
  const [debtPrincipal, setDebtPrincipal] = useState('2.500,00');
  const [debtRate, setDebtRate] = useState('14,00');
  const [debtMonths, setDebtMonths] = useState('12');
  const [debtScenarioName, setDebtScenarioName] = useState('Dívida do cartão');

  const [initialValue, setInitialValue] = useState('10.000,00');
  const [monthlyContribution, setMonthlyContribution] = useState('500,00');
  const [investmentRate, setInvestmentRate] = useState('0,80');
  const [durationValue, setDurationValue] = useState('5');
  const [durationUnit, setDurationUnit] = useState<DurationUnit>('years');
  const [futureExpense, setFutureExpense] = useState('80.000,00');
  const [goalName, setGoalName] = useState('Carro novo');
  const [investmentScenarioName, setInvestmentScenarioName] =
    useState('Projeto carro novo');

  const [savedSimulations, setSavedSimulations] = useState<SavedSimulation[]>(
    [],
  );
  const [savedLoading, setSavedLoading] = useState(true);
  const [savingType, setSavingType] = useState<SimulationType | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const debtSimulation = useMemo(
    () =>
      simulateDebt(
        parseCurrencyToCents(debtPrincipal),
        parsePercentage(debtRate),
        parsePositiveInteger(debtMonths),
      ),
    [debtMonths, debtPrincipal, debtRate],
  );

  const totalMonths = useMemo(() => {
    const duration = parsePositiveInteger(durationValue);
    return durationUnit === 'years' ? duration * 12 : duration;
  }, [durationUnit, durationValue]);

  const investmentSimulation = useMemo(
    () =>
      simulateInvestment(
        parseCurrencyToCents(initialValue),
        parseCurrencyToCents(monthlyContribution),
        parsePercentage(investmentRate),
        totalMonths,
      ),
    [initialValue, investmentRate, monthlyContribution, totalMonths],
  );

  const futureExpenseCents = parseCurrencyToCents(futureExpense);
  const comparisonCents =
    investmentSimulation.finalAmountCents - futureExpenseCents;

  const loadSavedSimulations = useCallback(async (signal?: AbortSignal) => {
    setSavedLoading(true);
    try {
      const response = await fetch('/api/simulations', { signal });
      const result = (await response.json()) as {
        simulations?: SavedSimulation[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          result.error ?? 'Não foi possível carregar seus cenários.',
        );
      }
      setSavedSimulations(result.simulations ?? []);
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
          : 'Não foi possível carregar seus cenários.',
      );
    } finally {
      if (!signal?.aborted) setSavedLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        void loadSavedSimulations(controller.signal);
      }
    });
    return () => controller.abort();
  }, [loadSavedSimulations]);

  async function saveSimulation(type: SimulationType) {
    setSavingType(type);
    setMessage('');
    setError('');
    const input =
      type === 'debt'
        ? {
            principalCents: parseCurrencyToCents(debtPrincipal),
            monthlyRatePercent: parsePercentage(debtRate),
            months: parsePositiveInteger(debtMonths),
          }
        : {
            initialValueCents: parseCurrencyToCents(initialValue),
            monthlyContributionCents: parseCurrencyToCents(monthlyContribution),
            monthlyRatePercent: parsePercentage(investmentRate),
            durationValue: parsePositiveInteger(durationValue),
            durationUnit,
            futureExpenseCents,
            goalName,
          };
    const name = type === 'debt' ? debtScenarioName : investmentScenarioName;

    try {
      const response = await fetch('/api/simulations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulationType: type, name, input }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? 'Não foi possível salvar o cenário.');
      }
      setMessage(`Cenário “${name}” salvo no banco de dados.`);
      await loadSavedSimulations();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível salvar o cenário.',
      );
    } finally {
      setSavingType(null);
    }
  }

  function loadScenario(simulation: SavedSimulation) {
    const input = simulation.input;
    if (simulation.simulationType === 'debt') {
      setDebtPrincipal(formatCurrencyInput(numberFrom(input.principalCents)));
      setDebtRate(
        numberFrom(input.monthlyRatePercent).toFixed(2).replace('.', ','),
      );
      setDebtMonths(String(numberFrom(input.months, 1)));
      setDebtScenarioName(simulation.name);
    } else {
      setInitialValue(formatCurrencyInput(numberFrom(input.initialValueCents)));
      setMonthlyContribution(
        formatCurrencyInput(numberFrom(input.monthlyContributionCents)),
      );
      setInvestmentRate(
        numberFrom(input.monthlyRatePercent).toFixed(2).replace('.', ','),
      );
      setDurationValue(String(numberFrom(input.durationValue, 1)));
      setDurationUnit(input.durationUnit === 'months' ? 'months' : 'years');
      setFutureExpense(
        formatCurrencyInput(numberFrom(input.futureExpenseCents)),
      );
      setGoalName(
        typeof input.goalName === 'string' ? input.goalName : 'Gasto futuro',
      );
      setInvestmentScenarioName(simulation.name);
    }
    setError('');
    setMessage(`Cenário “${simulation.name}” carregado para edição.`);
  }

  return (
    <section className="min-h-[calc(100vh-81px)] pb-16">
      <header className="border-b border-white/15 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-4 px-5 pb-8 pt-8 sm:px-8 lg:px-10">
          <div>
            <p className="mb-1 text-sm font-medium text-white/80">
              Simulação real
            </p>
            <h1 className="text-3xl font-bold tracking-[-0.045em] sm:text-4xl">
              Projete antes de decidir
            </h1>
          </div>
          <Badge className="border border-white/15 bg-[#292d35]/80 text-white">
            Juros compostos · evolução mensal
          </Badge>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-5 pt-8 sm:px-8 xl:grid-cols-2 lg:px-10">
        <Card className="overflow-hidden border-0 shadow-[0_18px_50px_rgba(0,0,0,.22)] ring-1 ring-white/15">
          <CardHeader className="border-b border-white/10 pb-4">
            <CardTitle className="flex items-center gap-2 text-xl font-bold tracking-tight">
              <span className="grid size-9 place-items-center rounded-xl bg-red-500/15 text-red-300">
                <CreditCard className="size-5" />
              </span>
              Dívida no rotativo
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Veja o efeito bola de neve de uma fatura não paga.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                id="debt-principal"
                label="Fatura atrasada"
                value={debtPrincipal}
                onChange={setDebtPrincipal}
                prefix="R$"
              />
              <Field
                id="debt-rate"
                label="Juros ao mês"
                value={debtRate}
                onChange={setDebtRate}
                suffix="%"
              />
              <Field
                id="debt-months"
                label="Meses de atraso"
                value={debtMonths}
                onChange={setDebtMonths}
                inputMode="numeric"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <ResultCard
                label="Dívida ao final"
                value={formatCurrency(debtSimulation.finalAmountCents)}
                detail={`${debtMonths || '0'} meses sem pagamento`}
                icon={<TrendingUp />}
                danger
              />
              <ResultCard
                label="Somente em juros"
                value={formatCurrency(debtSimulation.totalInterestCents)}
                detail="Valor acima da fatura original"
                icon={<TrendingDown />}
                danger
              />
            </div>

            <CurveChart
              points={debtSimulation.points}
              label="Dívida acumulada"
              color="#fb7185"
              ariaLabel="Curva mensal do crescimento da dívida do cartão"
            />

            <SaveScenario
              inputId="debt-scenario-name"
              name={debtScenarioName}
              onNameChange={setDebtScenarioName}
              saving={savingType === 'debt'}
              onSave={() => void saveSimulation('debt')}
            />
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-0 shadow-[0_18px_50px_rgba(0,0,0,.22)] ring-1 ring-white/15">
          <CardHeader className="border-b border-white/10 pb-4">
            <CardTitle className="flex items-center gap-2 text-xl font-bold tracking-tight">
              <span className="grid size-9 place-items-center rounded-xl bg-white/10 text-white">
                <PiggyBank className="size-5" />
              </span>
              Investimento x gasto futuro
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Compare o patrimônio projetado com uma compra planejada.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field
                id="initial-value"
                label="Valor inicial"
                value={initialValue}
                onChange={setInitialValue}
                prefix="R$"
              />
              <Field
                id="monthly-contribution"
                label="Aporte mensal"
                value={monthlyContribution}
                onChange={setMonthlyContribution}
                prefix="R$"
              />
              <Field
                id="investment-rate"
                label="Rendimento mensal"
                value={investmentRate}
                onChange={setInvestmentRate}
                suffix="%"
              />
              <div className="space-y-2">
                <Label htmlFor="duration-value">Tempo</Label>
                <div className="grid grid-cols-[1fr_108px] gap-2">
                  <Input
                    id="duration-value"
                    value={durationValue}
                    onChange={(event) => setDurationValue(event.target.value)}
                    inputMode="numeric"
                    className="h-11"
                  />
                  <NativeSelect
                    value={durationUnit}
                    onChange={(event) =>
                      setDurationUnit(event.target.value as DurationUnit)
                    }
                    aria-label="Unidade de tempo"
                    className="w-full"
                  >
                    <NativeSelectOption value="months">
                      Meses
                    </NativeSelectOption>
                    <NativeSelectOption value="years">Anos</NativeSelectOption>
                  </NativeSelect>
                </div>
              </div>
              <Field
                id="future-expense"
                label="Valor do gasto futuro"
                value={futureExpense}
                onChange={setFutureExpense}
                prefix="R$"
              />
              <Field
                id="goal-name"
                label="Nome do objetivo"
                value={goalName}
                onChange={setGoalName}
                inputMode="text"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <ResultCard
                label="Patrimônio projetado"
                value={formatCurrency(investmentSimulation.finalAmountCents)}
                detail={`${totalMonths} meses de acumulação`}
                icon={<TrendingUp />}
              />
              <ResultCard
                label="Rendimento estimado"
                value={formatCurrency(investmentSimulation.totalEarningsCents)}
                detail="Além do dinheiro aportado"
                icon={<PiggyBank />}
              />
              <ResultCard
                label={
                  comparisonCents >= 0
                    ? 'Sobra após o objetivo'
                    : 'Falta para o objetivo'
                }
                value={formatCurrency(Math.abs(comparisonCents))}
                detail={goalName || 'Gasto futuro'}
                icon={<Target />}
                danger={comparisonCents < 0}
              />
            </div>

            <CurveChart
              points={investmentSimulation.points}
              label="Patrimônio projetado"
              color="#ffffff"
              targetCents={futureExpenseCents}
              targetLabel={goalName || 'Gasto futuro'}
              ariaLabel="Curva do investimento comparada ao valor do gasto futuro"
            />

            <SaveScenario
              inputId="investment-scenario-name"
              name={investmentScenarioName}
              onNameChange={setInvestmentScenarioName}
              saving={savingType === 'investment'}
              onSave={() => void saveSimulation('investment')}
            />
          </CardContent>
        </Card>
      </div>

      <div className="mx-auto max-w-7xl px-5 pt-6 sm:px-8 lg:px-10">
        {(message || error) && (
          <output
            aria-live="polite"
            className={`mb-6 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
              error
                ? 'border-red-400/20 bg-red-950/70 text-red-200'
                : 'border-white/15 bg-white/10 text-white'
            }`}
          >
            {error && <AlertCircle className="mt-0.5 size-4 shrink-0" />}
            {error || message}
          </output>
        )}

        <Card className="border-0 shadow-[0_18px_50px_rgba(0,0,0,.2)] ring-1 ring-white/15">
          <CardHeader className="border-b border-white/10 pb-4">
            <CardTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
              <FolderHeart className="size-5 text-white" />
              Cenários salvos
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Seus favoritos ficam disponíveis somente na sua conta.
            </p>
          </CardHeader>
          <CardContent>
            {savedLoading ? (
              <div className="grid h-28 place-items-center text-muted-foreground">
                <LoaderCircle className="size-7 animate-spin" />
              </div>
            ) : savedSimulations.length === 0 ? (
              <div className="grid min-h-28 place-items-center text-center">
                <div>
                  <FolderHeart className="mx-auto mb-2 size-8 text-white/60" />
                  <p className="font-semibold">Nenhum cenário salvo</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Ajuste os valores acima e salve sua primeira projeção.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {savedSimulations.map((simulation) => (
                  <article
                    key={simulation.id}
                    className="rounded-xl border border-white/10 bg-white/5 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">
                          {simulation.name}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {dateFormatter.format(new Date(simulation.updatedAt))}
                        </p>
                      </div>
                      <Badge
                        className={
                          simulation.simulationType === 'debt'
                            ? 'bg-red-500/15 text-red-200'
                            : 'bg-white/10 text-white'
                        }
                      >
                        {simulation.simulationType === 'debt'
                          ? 'Dívida'
                          : 'Investimento'}
                      </Badge>
                    </div>
                    <p className="mt-4 text-xs text-muted-foreground">
                      Resultado projetado
                    </p>
                    <p className="mt-1 text-lg font-bold tabular-nums">
                      {formatCurrency(
                        numberFrom(simulation.result.finalAmountCents),
                      )}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-4 w-full"
                      onClick={() => loadScenario(simulation)}
                    >
                      Carregar cenário
                    </Button>
                  </article>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  prefix,
  suffix,
  inputMode = 'decimal',
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  prefix?: string;
  suffix?: string;
  inputMode?: 'decimal' | 'numeric' | 'text';
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {prefix}
          </span>
        )}
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          inputMode={inputMode}
          className={`h-11 ${prefix ? 'pl-9' : ''} ${suffix ? 'pr-8' : ''}`}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function ResultCard({
  label,
  value,
  detail,
  icon,
  danger = false,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        danger
          ? 'border-red-400/20 bg-red-500/10'
          : 'border-white/10 bg-white/5'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className={danger ? 'text-red-300' : 'text-white'}>{icon}</span>
      </div>
      <p
        className={`mt-3 text-xl font-bold tracking-tight tabular-nums ${
          danger ? 'text-red-200' : 'text-white'
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function CurveChart({
  points,
  label,
  color,
  targetCents,
  targetLabel,
  ariaLabel,
}: {
  points: SimulationPoint[];
  label: string;
  color: string;
  targetCents?: number;
  targetLabel?: string;
  ariaLabel: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let active = true;
    let chart: ChartInstance | undefined;

    void import('chart.js').then(
      ({
        Chart,
        LineController,
        LineElement,
        PointElement,
        LinearScale,
        CategoryScale,
        Tooltip,
        Legend,
        Filler,
      }) => {
        if (!active || !canvasRef.current) return;
        Chart.register(
          LineController,
          LineElement,
          PointElement,
          LinearScale,
          CategoryScale,
          Tooltip,
          Legend,
          Filler,
        );
        const datasets = [
          {
            label,
            data: points.map((point) => point.valueCents),
            borderColor: color,
            backgroundColor: `${color}22`,
            borderWidth: 3,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.28,
            fill: true,
          },
        ];

        if (targetCents !== undefined && targetCents > 0) {
          datasets.push({
            label: targetLabel ?? 'Gasto futuro',
            data: points.map(() => targetCents),
            borderColor: '#fb923c',
            backgroundColor: '#fb923c11',
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 0,
            tension: 0,
            fill: false,
            borderDash: [7, 5],
          } as (typeof datasets)[number]);
        }

        chart = new Chart(canvasRef.current, {
          type: 'line',
          data: {
            labels: points.map((point) =>
              point.month === 0 ? 'Hoje' : `Mês ${point.month}`,
            ),
            datasets,
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 220 },
            interaction: { intersect: false, mode: 'index' },
            plugins: {
              legend: {
                labels: { color: '#d8dde6', usePointStyle: true, boxWidth: 8 },
              },
              tooltip: {
                callbacks: {
                  label: (context) =>
                    `${context.dataset.label}: ${formatCurrency(Number(context.raw))}`,
                },
              },
            },
            scales: {
              x: {
                grid: { color: 'rgba(255,255,255,.05)' },
                ticks: { color: '#939baa', maxTicksLimit: 7 },
              },
              y: {
                beginAtZero: true,
                grid: { color: 'rgba(255,255,255,.08)' },
                ticks: {
                  color: '#939baa',
                  callback: (value) => formatCurrency(Number(value)),
                },
              },
            },
          },
        });
      },
    );

    return () => {
      active = false;
      chart?.destroy();
    };
  }, [color, label, points, targetCents, targetLabel]);

  return (
    <figure
      aria-label={ariaLabel}
      className="h-64 rounded-xl border border-white/10 bg-[#242830] p-3"
    >
      <canvas ref={canvasRef}>{ariaLabel}</canvas>
    </figure>
  );
}

function SaveScenario({
  inputId,
  name,
  onNameChange,
  saving,
  onSave,
}: {
  inputId: string;
  name: string;
  onNameChange: (value: string) => void;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-3 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1 space-y-2">
        <Label htmlFor={inputId}>Nome do cenário</Label>
        <Input
          id={inputId}
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          maxLength={80}
          className="h-10"
        />
      </div>
      <Button
        type="button"
        disabled={saving || name.trim().length < 2}
        onClick={onSave}
        className="bg-[#f4513e] font-semibold text-white hover:bg-[#e83232]"
      >
        {saving ? <LoaderCircle className="animate-spin" /> : <Save />}
        {saving ? 'Salvando...' : 'Salvar cenário'}
      </Button>
    </div>
  );
}
