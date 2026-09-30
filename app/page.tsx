'use client';
import { parseCurrencyToCents } from '@/lib/frontend-input';
import { apiFetch, readApiJson } from '@/lib/client-api';

import { useClerk } from '@clerk/nextjs';
import {
  ReactNode,
  SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Bot,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  LoaderCircle,
  LockKeyhole,
  LogIn,
  LogOut,
  Pencil,
  PiggyBank,
  Plus,
  ReceiptText,
  Settings,
  ShieldCheck,
  Target,
  UserPlus,
  WalletCards,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { currentMonthInBrazil, todayInBrazil } from '@/lib/finance-month';
import { useLatestRequest } from '@/hooks/use-latest-request';
import { AssistantPanel } from './assistant-panel';
import { BudgetsPanel } from './budgets-panel';
import { CreditCardsPanel } from './credit-cards-panel';
import { SettingsPanel } from './settings-panel';
import { useMoneyFormatter, usePreferences } from './preferences-provider';
import { InvestmentsPanel } from './investments-panel';
import { RecurringPanel } from './recurring-panel';
import { SimulationsPanel } from './simulations-panel';

type TransactionType = 'income' | 'expense';

type Category = {
  id: number;
  name: string;
  type: TransactionType;
};

type Transaction = {
  id: number;
  description: string;
  type: TransactionType | 'transfer';
  amountCents: number;
  transactionDate: string;
  categoryId: number;
  categoryName: string;
};

type FinanceData = {
  transactions: Transaction[];
  categories: Category[];
  summary: {
    incomeCents: number;
    expenseCents: number;
    transferCents: number;
    balanceCents: number;
  };
};

type CreateTransactionInput = {
  description: string;
  type: TransactionType;
  amountCents: number;
  transactionDate: string;
  categoryId: number;
};

type UpdateTransactionInput = CreateTransactionInput & { id: number };

type SessionData = {
  authenticated: boolean;
  user: {
    displayName: string;
    email: string;
  } | null;
  signInPath: string;
  signUpPath: string;
};

const defaultSignInPath = '/sign-in?redirect_url=%2F';
const defaultSignUpPath = '/sign-up?redirect_url=%2F';

declare global {
  interface Document {
    modelContext?: {
      registerTool: (
        tool: {
          name: string;
          title?: string;
          description: string;
          inputSchema: object;
          annotations?: {
            readOnlyHint?: boolean;
            untrustedContentHint?: boolean;
          };
          execute: (input: unknown) => unknown;
        },
        options?: { signal?: AbortSignal },
      ) => void | Promise<void>;
    };
  }
}

const emptyData: FinanceData = {
  transactions: [],
  categories: [],
  summary: {
    incomeCents: 0,
    expenseCents: 0,
    transferCents: 0,
    balanceCents: 0,
  },
};

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  timeZone: 'UTC',
});

const monthFormatter = new Intl.DateTimeFormat('pt-BR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatCurrencyInput(cents: number) {
  return (cents / 100).toFixed(2).replace('.', ',');
}

function formString(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value : '';
}

async function createTransaction(input: CreateTransactionInput) {
  const response = await apiFetch('/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const result = (await readApiJson(response)) as {
    id?: number;
    error?: string;
  };
  if (!response.ok)
    throw new Error(result.error ?? 'Não foi possível registrar a transação.');
  return result;
}

async function updateTransaction(input: UpdateTransactionInput) {
  const response = await apiFetch('/api/transactions', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const result = (await readApiJson(response)) as {
    id?: number;
    error?: string;
  };
  if (!response.ok)
    throw new Error(
      result.error ?? 'Não foi possível salvar as alterações da transação.',
    );
  return result;
}

function validateToolInput(input: unknown): CreateTransactionInput {
  if (!input || typeof input !== 'object')
    throw new Error('Dados da transação inválidos.');
  const value = input as Record<string, unknown>;
  if (
    typeof value.description !== 'string' ||
    !['income', 'expense'].includes(String(value.type)) ||
    !Number.isSafeInteger(value.amountCents) ||
    typeof value.transactionDate !== 'string' ||
    !Number.isSafeInteger(value.categoryId)
  ) {
    throw new Error(
      'Preencha descrição, tipo, valor em centavos, data e categoria.',
    );
  }
  return value as CreateTransactionInput;
}

export default function Home() {
  const formatCurrency = useMoneyFormatter();
  const {
    preferences,
    loading: preferencesLoading,
    error: preferencesError,
  } = usePreferences();
  const [activeArea, setActiveArea] = useState<string | null>(null);
  const { signOut } = useClerk();
  const [session, setSession] = useState<SessionData | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [assistantVisited, setAssistantVisited] = useState(false);
  const [month, setMonth] = useState(currentMonthInBrazil);
  const visibleMonth = useRef(month);
  useEffect(() => {
    visibleMonth.current = month;
  }, [month]);
  const [data, setData] = useState<FinanceData>(emptyData);
  const [budgetRefreshKey, setBudgetRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [type, setType] = useState<TransactionType>('expense');
  const [categoryId, setCategoryId] = useState('');
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);
  const [editType, setEditType] = useState<TransactionType>('expense');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [investmentTransferOpen, setInvestmentTransferOpen] = useState(false);
  const [investmentTransferSaving, setInvestmentTransferSaving] =
    useState(false);
  const [investmentTransferError, setInvestmentTransferError] = useState('');
  const [investmentAvailableBalanceCents, setInvestmentAvailableBalanceCents] =
    useState<number | null>(null);

  const loadSession = useCallback(async (signal?: AbortSignal) => {
    setSessionError('');
    try {
      const response = await apiFetch('/api/session', { signal });
      const result = (await readApiJson(response)) as SessionData;
      if (!response.ok)
        throw new Error('Não foi possível verificar sua conta.');
      setSession(result);
    } catch (requestError) {
      if (
        requestError instanceof DOMException &&
        requestError.name === 'AbortError'
      ) {
        return;
      }
      setSessionError(
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível verificar sua conta.',
      );
    } finally {
      if (!signal?.aborted) setSessionLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void loadSession(controller.signal);
    });
    return () => controller.abort();
  }, [loadSession]);

  const user = session?.authenticated ? session.user : null;

  const beginDataRequest = useLatestRequest();
  const loadData = useCallback(
    async (selectedMonth: string, signal?: AbortSignal) => {
      if (selectedMonth !== visibleMonth.current) return;
      signal = beginDataRequest(signal).signal;
      if (signal.aborted) return;
      setLoading(true);
      setLoadError('');
      setError('');
      try {
        const response = await apiFetch(
          `/api/transactions?month=${selectedMonth}`,
          { signal },
        );
        const result = (await readApiJson(response)) as FinanceData & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(result.error ?? 'Não foi possível carregar o mês.');
        if (signal.aborted) return;
        setData(result);
        setBudgetRefreshKey((value) => value + 1);
      } catch (requestError) {
        if (signal.aborted) return;
        if (
          requestError instanceof DOMException &&
          requestError.name === 'AbortError'
        )
          return;
        const failure =
          requestError instanceof Error
            ? requestError.message
            : 'Não foi possível carregar o mês.';
        setError(failure);
        setLoadError(failure);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [beginDataRequest],
  );

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void loadData(month, controller.signal);
    });
    return () => controller.abort();
  }, [loadData, month, user]);

  const availableCategories = useMemo(
    () => data.categories.filter((category) => category.type === type),
    [data.categories, type],
  );

  const selectedCategoryId = availableCategories.some(
    (category) => String(category.id) === categoryId,
  )
    ? categoryId
    : availableCategories[0]
      ? String(availableCategories[0].id)
      : '';

  const editCategories = useMemo(
    () => data.categories.filter((category) => category.type === editType),
    [data.categories, editType],
  );

  const selectedEditCategoryId = editCategories.some(
    (category) => String(category.id) === editCategoryId,
  )
    ? editCategoryId
    : editCategories[0]
      ? String(editCategories[0].id)
      : '';

  useEffect(() => {
    if (!user) return;
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();

    void Promise.resolve(
      context.registerTool(
        {
          name: 'create_transaction',
          title: 'Registrar transação',
          description:
            'Registra uma receita ou despesa e atualiza o painel financeiro visível.',
          inputSchema: {
            type: 'object',
            properties: {
              description: { type: 'string', minLength: 2, maxLength: 120 },
              type: { type: 'string', enum: ['income', 'expense'] },
              amountCents: { type: 'integer', minimum: 1 },
              transactionDate: {
                type: 'string',
                pattern: '^\\d{4}-\\d{2}-\\d{2}$',
              },
              categoryId: { type: 'integer', minimum: 1 },
            },
            required: [
              'description',
              'type',
              'amountCents',
              'transactionDate',
              'categoryId',
            ],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          async execute(input) {
            const validInput = validateToolInput(input);
            const result = await createTransaction(validInput);
            if (validInput.transactionDate.startsWith(month))
              await loadData(month);
            return { id: result.id, status: 'created' };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);

    return () => lifecycle.abort();
  }, [loadData, month, user]);

  function changeMonth(offset: number) {
    const [year, monthNumber] = month.split('-').map(Number);
    const next = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
    setMonth(next.toISOString().slice(0, 7));
    setMessage('');
  }

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setError('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const input: CreateTransactionInput = {
      description: formString(form.get('description')).trim(),
      type,
      amountCents: parseCurrencyToCents(formString(form.get('amount'))),
      transactionDate: formString(form.get('transactionDate')),
      categoryId: Number(selectedCategoryId),
    };

    if (
      !Number.isSafeInteger(input.amountCents) ||
      input.amountCents <= 0 ||
      input.amountCents > 2_147_483_647
    ) {
      setError('Informe um valor válido maior que zero, como 1.000,50.');
      return;
    }
    setSaving(true);
    try {
      await createTransaction(input);
      formElement.reset();
      setType('expense');
      setMessage('Transação registrada com sucesso.');
      const transactionMonth = input.transactionDate.slice(0, 7);
      if (transactionMonth !== month) setMonth(transactionMonth);
      else await loadData(month);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível registrar a transação.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleInvestmentTransfer(
    event: SyntheticEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amountCents = parseCurrencyToCents(
      formString(form.get('investmentAmount')),
    );
    const contributionDate = formString(form.get('investmentDate'));
    const description = formString(form.get('investmentDescription')).trim();

    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
      setInvestmentTransferError('Informe um valor válido maior que zero.');
      return;
    }
    if (
      investmentAvailableBalanceCents === null ||
      amountCents > investmentAvailableBalanceCents
    ) {
      setInvestmentTransferError(
        'O aporte deve caber no saldo disponível da conta.',
      );
      return;
    }
    setInvestmentTransferSaving(true);
    setInvestmentTransferError('');
    try {
      const response = await apiFetch('/api/investment-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountCents, contributionDate, description }),
      });
      const result = (await readApiJson(response)) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? 'Não foi possível realizar o aporte.');
      }

      setInvestmentTransferOpen(false);
      setMessage(
        'Aporte realizado: o valor saiu da conta e entrou nos investimentos.',
      );
      setError('');
      const transferMonth = contributionDate.slice(0, 7);
      if (transferMonth !== month) setMonth(transferMonth);
      else await loadData(month);
      window.dispatchEvent(new Event('investment-wallet-updated'));
    } catch (requestError) {
      setInvestmentTransferError(
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível realizar o aporte.',
      );
    } finally {
      setInvestmentTransferSaving(false);
    }
  }

  async function openInvestmentTransfer() {
    setInvestmentTransferError('');
    setInvestmentAvailableBalanceCents(null);
    setInvestmentTransferOpen(true);
    try {
      const response = await apiFetch('/api/investment-wallet');
      const result = (await readApiJson(response)) as {
        mainBalanceCents?: number;
        error?: string;
      };
      if (!response.ok || !Number.isFinite(result.mainBalanceCents)) {
        throw new Error(
          result.error ?? 'Não foi possível consultar o saldo disponível.',
        );
      }
      setInvestmentAvailableBalanceCents(Number(result.mainBalanceCents));
    } catch (requestError) {
      setInvestmentTransferError(
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível consultar o saldo disponível.',
      );
    }
  }

  function openTransactionEditor(transaction: Transaction) {
    if (transaction.type === 'transfer') return;
    setEditingTransaction(transaction);
    setEditType(transaction.type);
    setEditCategoryId(String(transaction.categoryId));
    setEditError('');
  }

  async function handleEditSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTransaction) return;

    const form = new FormData(event.currentTarget);
    const input: UpdateTransactionInput = {
      id: editingTransaction.id,
      description: formString(form.get('editDescription')).trim(),
      type: editType,
      amountCents: parseCurrencyToCents(formString(form.get('editAmount'))),
      transactionDate: formString(form.get('editTransactionDate')),
      categoryId: Number(selectedEditCategoryId),
    };

    if (
      !Number.isSafeInteger(input.amountCents) ||
      input.amountCents <= 0 ||
      input.amountCents > 2_147_483_647
    ) {
      setEditError('Informe um valor válido maior que zero.');
      return;
    }
    setEditSaving(true);
    setEditError('');
    try {
      await updateTransaction(input);
      setEditingTransaction(null);
      setMessage('Alterações da transação salvas no banco de dados.');
      setError('');
      const editedMonth = input.transactionDate.slice(0, 7);
      if (editedMonth !== month) setMonth(editedMonth);
      else await loadData(month);
    } catch (requestError) {
      setEditError(
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível salvar as alterações da transação.',
      );
    } finally {
      setEditSaving(false);
    }
  }

  const monthLabel = monthFormatter.format(new Date(`${month}-01T00:00:00Z`));

  if (sessionLoading) {
    return (
      <main className="brand-luxe grid min-h-screen place-items-center text-foreground">
        <div className="text-center">
          <LoaderCircle className="mx-auto size-8 animate-spin text-foreground" />
          <p className="mt-3 text-sm text-slate-300">
            Protegendo seus dados...
          </p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <AuthScreen
        signInPath={session?.signInPath ?? defaultSignInPath}
        signUpPath={session?.signUpPath ?? defaultSignUpPath}
        error={sessionError}
        onRetry={() => {
          setSessionLoading(true);
          void loadSession();
        }}
      />
    );
  }

  return (
    <main className="brand-luxe min-h-screen text-foreground">
      <Tabs
        value={
          activeArea ??
          (preferencesLoading ? 'expenses' : preferences.defaultArea)
        }
        onValueChange={(value) => {
          setActiveArea(value);
          if (value === 'assistant') setAssistantVisited(true);
        }}
        className="gap-0"
      >
        <nav className="border-b border-foreground/15 text-foreground">
          <div className="mx-auto flex max-w-7xl min-w-0 flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8 lg:px-10">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-inverse text-inverse-foreground shadow-[0_8px_24px_rgba(255,255,255,.2)]">
                <CircleDollarSign className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-lg font-bold tracking-[-0.03em]">
                  Meu Caixa
                </p>
                <p className="text-xs text-foreground/75">
                  Controle financeiro pessoal
                </p>
              </div>
            </div>
            <div className="flex w-full min-w-0 flex-col-reverse items-stretch gap-3 lg:w-auto lg:flex-1 lg:flex-row lg:items-center lg:justify-end">
              <TabsList
                aria-label="Áreas do Meu Caixa"
                className="grid h-auto w-full min-w-0 flex-1 grid-cols-2 gap-1 rounded-xl border border-foreground/15 bg-card/80 p-1 sm:flex sm:flex-wrap [&>[data-slot=tabs-trigger]]:min-w-0 "
              >
                <TabsTrigger
                  value="expenses"
                  className="h-9 flex-none px-3 text-foreground/75 data-active:bg-primary data-active:text-primary-foreground data-active:hover:text-primary-foreground dark:data-active:bg-primary dark:data-active:text-primary-foreground dark:data-active:hover:text-primary-foreground sm:px-4"
                >
                  <ReceiptText /> Gastos
                </TabsTrigger>
                <TabsTrigger
                  value="investments"
                  className="h-9 flex-none px-3 text-foreground/75 data-active:bg-primary data-active:text-primary-foreground data-active:hover:text-primary-foreground dark:data-active:bg-primary dark:data-active:text-primary-foreground dark:data-active:hover:text-primary-foreground sm:px-4"
                >
                  <PiggyBank /> Investimentos
                </TabsTrigger>
                <TabsTrigger
                  value="credit-cards"
                  className="h-9 flex-none px-3 text-foreground/75 data-active:bg-primary data-active:text-primary-foreground data-active:hover:text-primary-foreground dark:data-active:bg-primary dark:data-active:text-primary-foreground dark:data-active:hover:text-primary-foreground sm:px-4"
                >
                  <CreditCard /> Cartões
                </TabsTrigger>
                <TabsTrigger
                  value="simulations"
                  className="h-9 flex-none px-3 text-foreground/75 data-active:bg-primary data-active:text-primary-foreground data-active:hover:text-primary-foreground dark:data-active:bg-primary dark:data-active:text-primary-foreground dark:data-active:hover:text-primary-foreground sm:px-4"
                >
                  <ChartNoAxesCombined /> Simulações
                </TabsTrigger>
                <TabsTrigger
                  value="assistant"
                  className="h-9 flex-none px-3 text-foreground/75 data-active:bg-primary data-active:text-primary-foreground data-active:hover:text-primary-foreground dark:data-active:bg-primary dark:data-active:text-primary-foreground dark:data-active:hover:text-primary-foreground sm:px-4"
                >
                  <Bot /> Assistente IA
                </TabsTrigger>
                <TabsTrigger
                  value="settings"
                  className="h-9 flex-none px-3 text-foreground/75 data-active:bg-primary data-active:text-primary-foreground sm:px-4"
                >
                  <Settings /> Configurações
                </TabsTrigger>
              </TabsList>
              <div className="flex shrink-0 self-end items-center gap-2 rounded-xl border border-foreground/15 bg-card/80 px-3 py-2 lg:self-auto">
                <span className="grid size-7 place-items-center rounded-full bg-inverse text-xs font-bold text-inverse-foreground">
                  {user.displayName.charAt(0).toUpperCase()}
                </span>
                <div className="hidden max-w-36 sm:block">
                  <p className="truncate text-xs font-semibold">
                    {user.displayName}
                  </p>
                  <p className="truncate text-[11px] text-foreground/65">
                    Conta protegida
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={() => void signOut({ redirectUrl: '/' })}
                  aria-label="Sair da conta"
                  variant="ghost"
                  size="icon-sm"
                  className="text-foreground/75 hover:bg-card/80 hover:text-foreground"
                >
                  <LogOut />
                </Button>
              </div>
            </div>
          </div>
        </nav>

        {preferencesError && (
          <div
            role="alert"
            className="mx-auto mt-4 flex max-w-7xl flex-wrap items-center gap-3 px-5 text-sm"
          >
            <span>
              Não foi possível carregar as preferências. Os valores estão
              ocultos por precaução.
            </span>
            <Button variant="outline" onClick={() => setActiveArea('settings')}>
              Revisar configurações
            </Button>
          </div>
        )}
        <TabsContent value="expenses" keepMounted className="pb-16">
          <header className="border-b border-foreground/15 text-foreground">
            <div className="mx-auto max-w-7xl px-5 pb-12 pt-9 sm:px-8 lg:px-10">
              <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="mb-1 text-sm font-medium text-foreground">
                    Visão mensal
                  </p>
                  <h1 className="capitalize text-3xl font-bold tracking-[-0.045em] sm:text-4xl">
                    {monthLabel}
                  </h1>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    aria-label="Ver orçamentos do mês"
                    title="Ver orçamentos do mês"
                    onClick={() =>
                      document
                        .getElementById('monthly-budgets')
                        ?.scrollIntoView({ behavior: 'smooth' })
                    }
                    className="border border-foreground/15 bg-card/80 text-foreground hover:bg-secondary"
                  >
                    <Target />
                    <span className="hidden md:inline">Orçamentos</span>
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void openInvestmentTransfer()}
                    className="mr-1 bg-inverse font-semibold text-inverse-foreground hover:bg-inverse/85"
                  >
                    <PiggyBank />
                    <span className="hidden sm:inline">Novo investimento</span>
                    <span className="sm:hidden">Investir</span>
                  </Button>
                  <Button
                    aria-label="Mês anterior"
                    disabled={saving || editSaving || investmentTransferSaving}
                    size="icon"
                    onClick={() => changeMonth(-1)}
                    className="border border-foreground/15 bg-card/80 text-foreground hover:bg-secondary"
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    aria-label="Próximo mês"
                    disabled={saving || editSaving || investmentTransferSaving}
                    size="icon"
                    onClick={() => changeMonth(1)}
                    className="border border-foreground/15 bg-card/80 text-foreground hover:bg-secondary"
                  >
                    <ChevronRight />
                  </Button>
                </div>
              </div>

              <section
                className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
                aria-label="Resumo mensal"
              >
                <SummaryCard
                  label="Receitas"
                  value={
                    loadError ? '—' : formatCurrency(data.summary.incomeCents)
                  }
                  icon={<ArrowUpRight />}
                  tone="positive"
                  loading={loading}
                />
                <SummaryCard
                  label="Despesas"
                  value={
                    loadError ? '—' : formatCurrency(data.summary.expenseCents)
                  }
                  icon={<ArrowDownLeft />}
                  tone="negative"
                  loading={loading}
                />
                <SummaryCard
                  label="Transferido para investimentos"
                  value={
                    loadError ? '—' : formatCurrency(data.summary.transferCents)
                  }
                  icon={<PiggyBank />}
                  tone="balance"
                  loading={loading}
                />
                <SummaryCard
                  label="Saldo do mês após aportes"
                  value={
                    loadError ? '—' : formatCurrency(data.summary.balanceCents)
                  }
                  icon={<WalletCards />}
                  tone="balance"
                  loading={loading}
                />
              </section>
            </div>
          </header>

          <div className="mx-auto grid max-w-7xl gap-6 px-5 pt-8 sm:px-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:px-10">
            <Card className="h-fit border-0 shadow-[0_18px_50px_rgba(0,0,0,.22)] ring-1 ring-foreground/15">
              <CardHeader className="border-b border-foreground/10 pb-4">
                <CardTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
                  <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Plus className="size-4" />
                  </span>
                  Nova transação
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-5" onSubmit={handleSubmit}>
                  <div className="space-y-2">
                    <Label htmlFor="description">Descrição</Label>
                    <Input
                      id="description"
                      name="description"
                      required
                      minLength={2}
                      maxLength={120}
                      placeholder="Ex.: supermercado"
                      className="h-11"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="type">Tipo</Label>
                      <NativeSelect
                        id="type"
                        value={type}
                        onChange={(event) => {
                          setType(event.target.value as TransactionType);
                          setCategoryId('');
                        }}
                        className="w-full"
                      >
                        <NativeSelectOption value="expense">
                          Despesa
                        </NativeSelectOption>
                        <NativeSelectOption value="income">
                          Receita
                        </NativeSelectOption>
                      </NativeSelect>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="amount">Valor</Label>
                      <Input
                        id="amount"
                        name="amount"
                        required
                        inputMode="decimal"
                        placeholder="R$ 0,00"
                        className="h-11"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="category">Categoria</Label>
                      <NativeSelect
                        id="category"
                        required
                        value={selectedCategoryId}
                        onChange={(event) => setCategoryId(event.target.value)}
                        className="w-full"
                        disabled={!availableCategories.length}
                      >
                        {availableCategories.map((category) => (
                          <NativeSelectOption
                            key={category.id}
                            value={String(category.id)}
                          >
                            {category.name}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="transactionDate">Data</Label>
                      <Input
                        id="transactionDate"
                        name="transactionDate"
                        required
                        type="date"
                        defaultValue={todayInBrazil()}
                        className="h-11"
                      />
                    </div>
                  </div>

                  {(message || error) && (
                    <output
                      aria-live="polite"
                      className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${error ? 'bg-destructive/10 text-destructive' : 'bg-inverse/10 text-foreground'}`}
                    >
                      {error && (
                        <AlertCircle className="mt-0.5 size-4 shrink-0" />
                      )}
                      {error || message}
                    </output>
                  )}

                  <Button
                    type="submit"
                    size="lg"
                    disabled={saving || loading || !selectedCategoryId}
                    className="h-11 w-full font-semibold"
                  >
                    {saving ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Plus />
                    )}
                    {saving ? 'Registrando...' : 'Registrar transação'}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="min-h-[360px] border-0 shadow-[0_18px_50px_rgba(0,0,0,.2)] ring-1 ring-foreground/15">
              <CardHeader className="flex-row items-center justify-between border-b border-foreground/10 pb-4">
                <div>
                  <CardTitle className="text-lg font-bold tracking-tight">
                    Movimentações
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {loading
                      ? 'Carregando o mês...'
                      : `${data.transactions.length} ${data.transactions.length === 1 ? 'transação' : 'transações'} em ${monthLabel}`}
                  </p>
                </div>
                <CalendarDays
                  className="size-5 text-muted-foreground"
                  aria-hidden="true"
                />
              </CardHeader>
              <CardContent className="px-0">
                {loading ? (
                  <div className="grid min-h-60 place-items-center text-muted-foreground">
                    <LoaderCircle
                      className="size-7 animate-spin"
                      aria-label="Carregando transações"
                    />
                  </div>
                ) : loadError ? (
                  <div className="grid min-h-60 place-items-center px-6 text-center">
                    <div>
                      <AlertCircle className="mx-auto mb-3 size-8 text-red-500" />
                      <p className="font-medium">
                        Não foi possível abrir suas movimentações
                      </p>
                      <Button
                        variant="outline"
                        className="mt-4"
                        onClick={() => void loadData(month)}
                      >
                        Tentar novamente
                      </Button>
                    </div>
                  </div>
                ) : data.transactions.length === 0 ? (
                  <div className="grid min-h-60 place-items-center px-6 text-center">
                    <div>
                      <span className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-inverse/10 text-foreground">
                        <ReceiptText />
                      </span>
                      <p className="font-semibold">
                        Nenhuma movimentação neste mês
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Use o formulário para registrar sua primeira transação.
                      </p>
                    </div>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-5">Data</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead className="pr-5 text-right">Valor</TableHead>
                        <TableHead className="w-12 pr-5">
                          <span className="sr-only">Ações</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.transactions.map((transaction) => (
                        <TableRow key={transaction.id}>
                          <TableCell className="pl-5 text-muted-foreground">
                            {dateFormatter.format(
                              new Date(
                                `${transaction.transactionDate}T00:00:00Z`,
                              ),
                            )}
                          </TableCell>
                          <TableCell className="font-medium">
                            {transaction.description}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {transaction.type === 'transfer'
                                ? 'Transferência · Investimentos'
                                : transaction.categoryName}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold text-foreground tabular-nums">
                            {transaction.type === 'income' ? '+ ' : '− '}
                            {formatCurrency(transaction.amountCents)}
                          </TableCell>
                          <TableCell className="pr-5 text-right">
                            {transaction.type !== 'transfer' && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Editar ${transaction.description}`}
                                onClick={() =>
                                  openTransactionEditor(transaction)
                                }
                              >
                                <Pencil />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          <BudgetsPanel
            key={month}
            month={month}
            refreshKey={budgetRefreshKey}
          />

          <RecurringPanel
            key={`recurring-${month}`}
            month={month}
            categories={data.categories}
            refreshKey={budgetRefreshKey}
            onConfirmed={async () => {
              await loadData(month);
            }}
          />

          <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
            <Button variant="outline" onClick={() => setActiveArea('settings')}>
              <Settings /> Configurações e backup dos dados
            </Button>
          </div>

          <Dialog
            open={investmentTransferOpen}
            onOpenChange={(open) => {
              if (!investmentTransferSaving) setInvestmentTransferOpen(open);
            }}
          >
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Novo investimento</DialogTitle>
                <DialogDescription>
                  O valor será descontado do saldo da conta e creditado no saldo
                  de investimentos.
                </DialogDescription>
              </DialogHeader>
              <form className="space-y-4" onSubmit={handleInvestmentTransfer}>
                <div className="space-y-2">
                  <Label htmlFor="investment-transfer-description">
                    Descrição
                  </Label>
                  <Input
                    id="investment-transfer-description"
                    name="investmentDescription"
                    required
                    minLength={2}
                    maxLength={80}
                    defaultValue="Aplicação CDI/CDB"
                    className="h-11"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="investment-transfer-amount">Valor</Label>
                    <Input
                      id="investment-transfer-amount"
                      name="investmentAmount"
                      required
                      inputMode="decimal"
                      placeholder="R$ 0,00"
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="investment-transfer-date">Data</Label>
                    <Input
                      id="investment-transfer-date"
                      name="investmentDate"
                      type="date"
                      required
                      defaultValue={todayInBrazil()}
                      className="h-11"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-foreground/10 bg-inverse/5 p-3 text-sm text-muted-foreground">
                  Saldo principal disponível:{' '}
                  {investmentAvailableBalanceCents === null
                    ? 'consultando...'
                    : formatCurrency(investmentAvailableBalanceCents)}
                </div>

                {investmentTransferError && (
                  <output
                    aria-live="polite"
                    className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
                  >
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                    {investmentTransferError}
                  </output>
                )}

                <DialogFooter className="mx-0 mb-0 -mr-4 -ml-4">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={investmentTransferSaving}
                    onClick={() => setInvestmentTransferOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      investmentTransferSaving ||
                      investmentAvailableBalanceCents === null
                    }
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {investmentTransferSaving && (
                      <LoaderCircle className="animate-spin" />
                    )}
                    {investmentTransferSaving
                      ? 'Transferindo...'
                      : 'Confirmar aporte'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog
            open={editingTransaction !== null}
            onOpenChange={(open) => {
              if (!open && !editSaving) setEditingTransaction(null);
            }}
          >
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Editar transação</DialogTitle>
                <DialogDescription>
                  Ao salvar, o resumo do mês também será recalculado.
                </DialogDescription>
              </DialogHeader>
              {editingTransaction && (
                <form
                  key={editingTransaction.id}
                  className="space-y-4"
                  onSubmit={handleEditSubmit}
                >
                  <div className="space-y-2">
                    <Label htmlFor="edit-description">Descrição</Label>
                    <Input
                      id="edit-description"
                      name="editDescription"
                      required
                      minLength={2}
                      maxLength={120}
                      defaultValue={editingTransaction.description}
                      className="h-11"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="edit-type">Tipo</Label>
                      <NativeSelect
                        id="edit-type"
                        value={editType}
                        onChange={(event) => {
                          const nextType = event.target
                            .value as TransactionType;
                          setEditType(nextType);
                          const firstCategory = data.categories.find(
                            (category) => category.type === nextType,
                          );
                          setEditCategoryId(
                            firstCategory ? String(firstCategory.id) : '',
                          );
                        }}
                        className="w-full"
                      >
                        <NativeSelectOption value="expense">
                          Despesa
                        </NativeSelectOption>
                        <NativeSelectOption value="income">
                          Receita
                        </NativeSelectOption>
                      </NativeSelect>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-amount">Valor</Label>
                      <Input
                        id="edit-amount"
                        name="editAmount"
                        required
                        inputMode="decimal"
                        defaultValue={formatCurrencyInput(
                          editingTransaction.amountCents,
                        )}
                        className="h-11"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="edit-category">Categoria</Label>
                      <NativeSelect
                        id="edit-category"
                        required
                        value={selectedEditCategoryId}
                        onChange={(event) =>
                          setEditCategoryId(event.target.value)
                        }
                        className="w-full"
                      >
                        {editCategories.map((category) => (
                          <NativeSelectOption
                            key={category.id}
                            value={String(category.id)}
                          >
                            {category.name}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-transaction-date">Data</Label>
                      <Input
                        id="edit-transaction-date"
                        name="editTransactionDate"
                        type="date"
                        required
                        defaultValue={editingTransaction.transactionDate}
                        className="h-11"
                      />
                    </div>
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
                      onClick={() => setEditingTransaction(null)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      disabled={editSaving || !selectedEditCategoryId}
                    >
                      {editSaving && <LoaderCircle className="animate-spin" />}
                      {editSaving ? 'Salvando...' : 'Salvar alterações'}
                    </Button>
                  </DialogFooter>
                </form>
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="investments">
          <InvestmentsPanel />
        </TabsContent>

        <TabsContent value="credit-cards">
          <CreditCardsPanel />
        </TabsContent>

        <TabsContent value="simulations">
          <SimulationsPanel />
        </TabsContent>

        <TabsContent value="assistant" keepMounted>
          {(assistantVisited || preferences.defaultArea === 'assistant') && (
            <AssistantPanel />
          )}
        </TabsContent>
        <TabsContent value="settings">
          <SettingsPanel
            onRestored={async () => {
              await loadData(month);
              setBudgetRefreshKey((value) => value + 1);
            }}
          />
        </TabsContent>
      </Tabs>
    </main>
  );
}

function AuthScreen({
  signInPath,
  signUpPath,
  error,
  onRetry,
}: {
  signInPath: string;
  signUpPath: string;
  error: string;
  onRetry: () => void;
}) {
  return (
    <main className="brand-luxe min-h-screen text-foreground">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[1.05fr_.8fr] lg:px-10">
        <section>
          <div className="mb-9 flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-inverse text-inverse-foreground shadow-[0_8px_24px_rgba(255,255,255,.2)]">
              <CircleDollarSign className="size-6" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xl font-bold tracking-[-0.03em]">Meu Caixa</p>
              <p className="text-sm text-foreground/75">
                Suas finanças, somente suas
              </p>
            </div>
          </div>

          <p className="mb-3 text-sm font-semibold uppercase tracking-[.16em] text-foreground">
            Controle pessoal e seguro
          </p>
          <h1 className="max-w-xl text-4xl font-bold tracking-[-0.05em] sm:text-5xl">
            Cada pessoa acessa apenas o próprio caixa.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-foreground/80">
            Entre para registrar gastos, receitas e investimentos em uma área
            individual, protegida pela sua conta.
          </p>

          <div className="mt-8 grid max-w-lg gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-foreground/15 bg-card/80 p-4">
              <ShieldCheck className="mb-3 size-5 text-foreground" />
              <p className="font-semibold">Dados isolados</p>
              <p className="mt-1 text-sm leading-6 text-foreground/70">
                Consultas e alterações são vinculadas à conta autenticada.
              </p>
            </div>
            <div className="rounded-xl border border-foreground/15 bg-card/80 p-4">
              <LockKeyhole className="mb-3 size-5 text-foreground" />
              <p className="font-semibold">Senha fora do app</p>
              <p className="mt-1 text-sm leading-6 text-foreground/70">
                A autenticação é feita pelo Clerk, sem armazenar sua senha.
              </p>
            </div>
          </div>
        </section>

        <Card className="border-foreground/15 bg-popover text-foreground shadow-[0_30px_80px_rgba(0,0,0,.35)]">
          <CardHeader className="border-b border-foreground/10 pb-5">
            <CardTitle className="text-2xl font-bold tracking-[-0.04em]">
              Acesse seu espaço
            </CardTitle>
            <p className="text-sm leading-6 text-muted-foreground">
              Entre com segurança ou crie seu cadastro individual.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 pt-6">
            {error && (
              <output className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>
                  {error}{' '}
                  <button
                    type="button"
                    onClick={onRetry}
                    className="font-semibold underline underline-offset-2"
                  >
                    Tentar novamente
                  </button>
                </span>
              </output>
            )}
            <Button
              nativeButton={false}
              render={
                <a
                  href={signInPath}
                  target="_top"
                  aria-label="Entrar na minha conta"
                />
              }
              size="lg"
              className="h-12 w-full text-base font-semibold"
            >
              <LogIn /> Entrar
            </Button>
            <Button
              nativeButton={false}
              render={
                <a
                  href={signUpPath}
                  target="_top"
                  aria-label="Criar minha conta"
                />
              }
              variant="outline"
              size="lg"
              className="h-12 w-full text-base font-semibold"
            >
              <UserPlus /> Criar minha conta
            </Button>
            <p className="px-3 pt-3 text-center text-xs leading-5 text-muted-foreground">
              O Meu Caixa não recebe nem armazena sua senha.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  tone,
  loading,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  tone: 'positive' | 'negative' | 'balance';
  loading: boolean;
}) {
  const styles = {
    positive: 'border-foreground/25 bg-inverse/10 text-foreground',
    negative: 'border-foreground/15 bg-card/70 text-foreground',
    balance: 'border-foreground/15 bg-card/80 text-foreground',
  };
  return (
    <div className={`rounded-2xl border p-5 backdrop-blur-sm ${styles[tone]}`}>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-medium opacity-85">{label}</p>
        <span className="[&_svg]:size-5">{icon}</span>
      </div>
      <p
        className={`text-2xl font-bold tracking-[-0.035em] text-foreground tabular-nums ${loading ? 'animate-pulse opacity-50' : ''}`}
      >
        {loading ? 'R$ —' : value}
      </p>
    </div>
  );
}
