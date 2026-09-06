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
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  LoaderCircle,
  Pencil,
  PiggyBank,
  Plus,
  ReceiptText,
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
import { InvestmentsPanel } from './investments-panel';

type TransactionType = 'income' | 'expense';

type Category = {
  id: number;
  name: string;
  type: TransactionType;
};

type Transaction = {
  id: number;
  description: string;
  type: TransactionType;
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
  summary: { incomeCents: 0, expenseCents: 0, balanceCents: 0 },
};

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

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

function localToday() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function currentMonth() {
  return localToday().slice(0, 7);
}

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

async function createTransaction(input: CreateTransactionInput) {
  const response = await fetch('/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const result = (await response.json()) as { id?: number; error?: string };
  if (!response.ok)
    throw new Error(result.error ?? 'Não foi possível registrar a transação.');
  return result;
}

async function updateTransaction(input: UpdateTransactionInput) {
  const response = await fetch('/api/transactions', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const result = (await response.json()) as { id?: number; error?: string };
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
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<FinanceData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [type, setType] = useState<TransactionType>('expense');
  const [categoryId, setCategoryId] = useState('');
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);
  const [editType, setEditType] = useState<TransactionType>('expense');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const loadData = useCallback(
    async (selectedMonth: string, signal?: AbortSignal) => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(
          `/api/transactions?month=${selectedMonth}`,
          { signal },
        );
        const result = (await response.json()) as FinanceData & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(result.error ?? 'Não foi possível carregar o mês.');
        setData(result);
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name === 'AbortError'
        )
          return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Não foi possível carregar o mês.',
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void loadData(month, controller.signal);
    });
    return () => controller.abort();
  }, [loadData, month]);

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
  }, [loadData, month]);

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

  function openTransactionEditor(transaction: Transaction) {
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

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Tabs defaultValue="expenses" className="gap-0">
        <nav className="border-b border-white/10 bg-[#091b32] text-white">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8 lg:px-10">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-[#2de29b] text-[#08243b] shadow-[0_8px_24px_rgba(45,226,155,.25)]">
                <CircleDollarSign className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-lg font-bold tracking-[-0.03em]">
                  Meu Caixa
                </p>
                <p className="text-xs text-slate-300">
                  Controle financeiro pessoal
                </p>
              </div>
            </div>
            <TabsList className="h-11 rounded-xl border border-white/10 bg-white/10 p-1">
              <TabsTrigger
                value="expenses"
                className="h-9 px-4 text-slate-300 data-active:bg-white data-active:text-[#091b32]"
              >
                <ReceiptText /> Gastos
              </TabsTrigger>
              <TabsTrigger
                value="investments"
                className="h-9 px-4 text-slate-300 data-active:bg-violet-100 data-active:text-violet-950"
              >
                <PiggyBank /> Investimentos
              </TabsTrigger>
            </TabsList>
          </div>
        </nav>

        <TabsContent value="expenses" className="pb-16">
          <header className="finance-grid border-b border-white/10 bg-[#091b32] text-white">
            <div className="mx-auto max-w-7xl px-5 pb-12 pt-9 sm:px-8 lg:px-10">
              <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="mb-1 text-sm font-medium text-[#65e6b2]">
                    Visão mensal
                  </p>
                  <h1 className="capitalize text-3xl font-bold tracking-[-0.045em] sm:text-4xl">
                    {monthLabel}
                  </h1>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    aria-label="Mês anterior"
                    size="icon"
                    onClick={() => changeMonth(-1)}
                    className="border border-white/15 bg-white/10 text-white hover:bg-white/20"
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    aria-label="Próximo mês"
                    size="icon"
                    onClick={() => changeMonth(1)}
                    className="border border-white/15 bg-white/10 text-white hover:bg-white/20"
                  >
                    <ChevronRight />
                  </Button>
                </div>
              </div>

              <section
                className="grid gap-3 md:grid-cols-3"
                aria-label="Resumo mensal"
              >
                <SummaryCard
                  label="Receitas"
                  value={formatCurrency(data.summary.incomeCents)}
                  icon={<ArrowUpRight />}
                  tone="positive"
                  loading={loading}
                />
                <SummaryCard
                  label="Despesas"
                  value={formatCurrency(data.summary.expenseCents)}
                  icon={<ArrowDownLeft />}
                  tone="negative"
                  loading={loading}
                />
                <SummaryCard
                  label="Saldo do mês"
                  value={formatCurrency(data.summary.balanceCents)}
                  icon={<WalletCards />}
                  tone="balance"
                  loading={loading}
                />
              </section>
            </div>
          </header>

          <div className="mx-auto grid max-w-7xl gap-6 px-5 pt-8 sm:px-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:px-10">
            <Card className="h-fit border-0 shadow-[0_18px_50px_rgba(9,27,50,.09)] ring-1 ring-slate-200">
              <CardHeader className="border-b border-slate-100 pb-4">
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
                        defaultValue={localToday()}
                        className="h-11"
                      />
                    </div>
                  </div>

                  {(message || error) && (
                    <output
                      aria-live="polite"
                      className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}
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

            <Card className="min-h-[360px] border-0 shadow-[0_18px_50px_rgba(9,27,50,.07)] ring-1 ring-slate-200">
              <CardHeader className="flex-row items-center justify-between border-b border-slate-100 pb-4">
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
                ) : error && data.transactions.length === 0 ? (
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
                      <span className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-slate-100 text-slate-500">
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
                              {transaction.categoryName}
                            </Badge>
                          </TableCell>
                          <TableCell
                            className={`text-right font-semibold tabular-nums ${transaction.type === 'income' ? 'text-emerald-700' : 'text-slate-800'}`}
                          >
                            {transaction.type === 'expense' ? '− ' : '+ '}
                            {formatCurrency(transaction.amountCents)}
                          </TableCell>
                          <TableCell className="pr-5 text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Editar ${transaction.description}`}
                              onClick={() => openTransactionEditor(transaction)}
                            >
                              <Pencil />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

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
      </Tabs>
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
    positive: 'border-[#2de29b]/25 bg-[#2de29b]/10 text-[#65e6b2]',
    negative: 'border-amber-300/20 bg-amber-300/10 text-amber-200',
    balance: 'border-white/15 bg-white/10 text-white',
  };
  return (
    <div className={`rounded-2xl border p-5 backdrop-blur-sm ${styles[tone]}`}>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-medium opacity-85">{label}</p>
        <span className="[&_svg]:size-5">{icon}</span>
      </div>
      <p
        className={`text-2xl font-bold tracking-[-0.035em] text-white tabular-nums ${loading ? 'animate-pulse opacity-50' : ''}`}
      >
        {loading ? 'R$ —' : value}
      </p>
    </div>
  );
}
