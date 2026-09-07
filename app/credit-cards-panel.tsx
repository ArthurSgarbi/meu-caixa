'use client';

import {
  ReactNode,
  SyntheticEvent,
  useCallback,
  useEffect,
  useState,
} from 'react';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Landmark,
  LoaderCircle,
  Plus,
  ReceiptText,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type CreditCardData = {
  id: number;
  name: string;
  brand: string;
  lastFour: string;
  creditLimitCents: number;
  closingDay: number;
  dueDay: number;
};

type Invoice = {
  id: number | null;
  referenceMonth: string;
  closingDate: string;
  dueDate: string;
  status: 'open' | 'closed' | 'paid';
  totalCents: number;
};

type CardTransaction = {
  id: number;
  purchaseGroupId: string;
  description: string;
  amountCents: number;
  purchaseDate: string;
  installmentNumber: number;
  installmentCount: number;
};

type CreditCardsResponse = {
  cards: CreditCardData[];
  selectedCard: CreditCardData | null;
  months: string[];
  invoice: Invoice | null;
  transactions: CardTransaction[];
  summary: {
    limitTotalCents: number;
    availableCents: number;
    invoiceCents: number;
    spentThisMonthCents: number;
    futureInstallmentsCents: number;
    outstandingCents: number;
  };
};

const emptyData: CreditCardsResponse = {
  cards: [],
  selectedCard: null,
  months: [],
  invoice: null,
  transactions: [],
  summary: {
    limitTotalCents: 0,
    availableCents: 0,
    invoiceCents: 0,
    spentThisMonthCents: 0,
    futureInstallmentsCents: 0,
    outstandingCents: 0,
  },
};

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});
const monthFormatter = new Intl.DateTimeFormat('pt-BR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function localToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatCurrency(cents: number) {
  return currencyFormatter.format(cents / 100);
}

function formatMonth(month: string) {
  return monthFormatter.format(new Date(`${month}-01T00:00:00Z`));
}

function formatDate(date: string) {
  if (!date) return '—';
  return dateFormatter.format(new Date(`${date}T00:00:00Z`));
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

export function CreditCardsPanel() {
  const [data, setData] = useState<CreditCardsResponse>(emptyData);
  const [selectedCardId, setSelectedCardId] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [invoiceSaving, setInvoiceSaving] = useState(false);
  const [newCardOpen, setNewCardOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadCards = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError('');
      const params = new URLSearchParams({ month: selectedMonth });
      if (selectedCardId) params.set('cardId', selectedCardId);

      try {
        const response = await fetch(`/api/credit-cards?${params}`, {
          signal,
        });
        const result = (await response.json()) as CreditCardsResponse & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(
            result.error ?? 'Não foi possível carregar seus cartões.',
          );
        }
        setData(result);
        if (!selectedCardId && result.selectedCard) {
          setSelectedCardId(String(result.selectedCard.id));
        }
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
            : 'Não foi possível carregar seus cartões.',
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [selectedCardId, selectedMonth],
  );

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void loadCards(controller.signal);
    });
    return () => controller.abort();
  }, [loadCards]);

  const usedPercentage =
    data.summary.limitTotalCents > 0
      ? Math.min(
          100,
          Math.max(
            0,
            (data.summary.outstandingCents / data.summary.limitTotalCents) *
              100,
          ),
        )
      : 0;

  async function createCard(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/credit-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_card',
          name: formString(form.get('cardName')),
          brand: formString(form.get('brand')),
          lastFour: formString(form.get('lastFour')),
          creditLimitCents: parseCurrencyToCents(
            formString(form.get('creditLimit')),
          ),
          closingDay: Number(formString(form.get('closingDay'))),
          dueDay: Number(formString(form.get('dueDay'))),
        }),
      });
      const result = (await response.json()) as {
        id?: number;
        error?: string;
      };
      if (!response.ok || !result.id) {
        throw new Error(result.error ?? 'Não foi possível criar o cartão.');
      }
      formElement.reset();
      setNewCardOpen(false);
      setSelectedCardId(String(result.id));
      setMessage('Cartão salvo com segurança.');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível criar o cartão.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function createPurchase(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data.selectedCard) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/credit-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_purchase',
          cardId: data.selectedCard.id,
          description: formString(form.get('description')),
          totalAmountCents: parseCurrencyToCents(
            formString(form.get('amount')),
          ),
          purchaseDate: formString(form.get('purchaseDate')),
          installmentCount: Number(formString(form.get('installmentCount'))),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? 'Não foi possível registrar a compra.');
      }
      formElement.reset();
      setMessage('Compra lançada e parcelas distribuídas nas faturas.');
      await loadCards();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível registrar a compra.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleInvoicePayment() {
    if (!data.invoice?.id) return;
    setInvoiceSaving(true);
    setError('');
    setMessage('');
    const nextStatus = data.invoice.status === 'paid' ? 'open' : 'paid';
    try {
      const response = await fetch('/api/credit-cards', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: data.invoice.id,
          status: nextStatus,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? 'Não foi possível atualizar a fatura.');
      }
      setMessage(
        nextStatus === 'paid'
          ? 'Fatura marcada como paga. O limite foi atualizado.'
          : 'Fatura reaberta.',
      );
      await loadCards();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível atualizar a fatura.',
      );
    } finally {
      setInvoiceSaving(false);
    }
  }

  return (
    <section className="min-h-[calc(100vh-81px)] pb-16">
      <header className="border-b border-white/15 text-white">
        <div className="mx-auto max-w-7xl px-5 pb-10 pt-9 sm:px-8 lg:px-10">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-1 text-sm font-medium text-white">
                Gestão de cartões de crédito
              </p>
              <h1 className="text-3xl font-bold tracking-[-0.045em] sm:text-4xl">
                Limite e faturas sob controle
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {data.cards.length > 0 && (
                <NativeSelect
                  aria-label="Selecionar cartão"
                  value={selectedCardId}
                  onChange={(event) => setSelectedCardId(event.target.value)}
                  className="min-w-48 border-white/15 bg-[#292d35]/90 text-white"
                >
                  {data.cards.map((card) => (
                    <NativeSelectOption key={card.id} value={String(card.id)}>
                      {card.name} •••• {card.lastFour}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              )}
              <Button
                type="button"
                onClick={() => {
                  setError('');
                  setMessage('');
                  setNewCardOpen(true);
                }}
                className="border border-white/20 bg-white text-[#242830] hover:bg-white/90"
              >
                <Plus /> Novo cartão
              </Button>
            </div>
          </div>

          {data.selectedCard ? (
            <>
              <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Limite total"
                  value={formatCurrency(data.summary.limitTotalCents)}
                  icon={<CircleDollarSign />}
                />
                <MetricCard
                  label="Limite disponível"
                  value={formatCurrency(data.summary.availableCents)}
                  detail={`${formatCurrency(data.summary.futureInstallmentsCents)} em parcelas futuras`}
                  icon={<WalletCards />}
                  featured
                />
                <MetricCard
                  label={
                    selectedMonth === currentMonth()
                      ? 'Valor a pagar'
                      : 'Fatura selecionada'
                  }
                  value={formatCurrency(data.summary.invoiceCents)}
                  icon={<ReceiptText />}
                />
                <MetricCard
                  label="Total gasto no mês"
                  value={formatCurrency(data.summary.spentThisMonthCents)}
                  icon={<Landmark />}
                />
              </div>
              <div className="overflow-hidden rounded-full bg-[#292d35]/65">
                <div
                  className="h-2 rounded-full bg-white transition-[width] duration-300"
                  style={{ width: `${usedPercentage}%` }}
                />
              </div>
              <p className="mt-2 text-right text-xs text-white/75">
                {usedPercentage.toFixed(0)}% do limite comprometido
              </p>
            </>
          ) : (
            <Card className="border-0 ring-1 ring-white/15">
              <CardContent className="flex flex-col items-center px-6 py-10 text-center">
                <CreditCard className="mb-4 size-10 text-white" />
                <p className="text-lg font-semibold">
                  Cadastre seu primeiro cartão
                </p>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  Informe limite, fechamento e vencimento para acompanhar as
                  próximas faturas.
                </p>
                <Button
                  className="mt-5"
                  onClick={() => {
                    setError('');
                    setMessage('');
                    setNewCardOpen(true);
                  }}
                >
                  <Plus /> Cadastrar cartão
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </header>

      {data.selectedCard && (
        <div className="mx-auto grid max-w-7xl gap-6 px-5 pt-8 sm:px-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:px-10">
          <Card className="h-fit border-0 shadow-[0_18px_50px_rgba(0,0,0,.22)] ring-1 ring-white/15">
            <CardHeader className="border-b border-white/10 pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <span className="grid size-8 place-items-center rounded-lg bg-white text-[#242830]">
                  <Plus className="size-4" />
                </span>
                Nova compra
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-5" onSubmit={createPurchase}>
                <div className="space-y-2">
                  <Label htmlFor="card-purchase-description">Descrição</Label>
                  <Input
                    id="card-purchase-description"
                    name="description"
                    required
                    minLength={2}
                    maxLength={100}
                    placeholder="Ex.: notebook"
                    className="h-11"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="card-purchase-amount">Valor total</Label>
                    <Input
                      id="card-purchase-amount"
                      name="amount"
                      required
                      inputMode="decimal"
                      placeholder="R$ 0,00"
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="installment-count">Parcelas</Label>
                    <Input
                      id="installment-count"
                      name="installmentCount"
                      required
                      type="number"
                      min={1}
                      max={36}
                      defaultValue={1}
                      className="h-11"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="card-purchase-date">Data da compra</Label>
                  <Input
                    id="card-purchase-date"
                    name="purchaseDate"
                    required
                    type="date"
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
                    {error && (
                      <AlertCircle className="mt-0.5 size-4 shrink-0" />
                    )}
                    {error || message}
                  </output>
                )}
                <Button
                  type="submit"
                  disabled={saving || loading}
                  className="h-11 w-full bg-[#f4513e] font-semibold text-white hover:bg-[#e83232]"
                >
                  {saving ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Plus />
                  )}
                  {saving ? 'Salvando...' : 'Registrar compra'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="min-w-0 space-y-6">
            <Card className="border-0 shadow-[0_18px_50px_rgba(0,0,0,.2)] ring-1 ring-white/15">
              <CardHeader className="gap-4 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-lg">
                    Histórico de faturas
                  </CardTitle>
                  <p className="mt-1 capitalize text-sm text-muted-foreground">
                    {formatMonth(selectedMonth)}
                  </p>
                </div>
                <NativeSelect
                  aria-label="Selecionar mês da fatura"
                  value={selectedMonth}
                  onChange={(event) => setSelectedMonth(event.target.value)}
                  className="w-full sm:w-52"
                >
                  {data.months.map((month) => (
                    <NativeSelectOption key={month} value={month}>
                      {formatMonth(month)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </CardHeader>
              <CardContent className="grid gap-3 pt-5 sm:grid-cols-3">
                <InvoiceDate
                  label="Fechamento"
                  value={formatDate(data.invoice?.closingDate ?? '')}
                  icon={<CalendarClock />}
                />
                <InvoiceDate
                  label="Vencimento"
                  value={formatDate(data.invoice?.dueDate ?? '')}
                  icon={<Clock3 />}
                />
                <div className="rounded-xl bg-white/8 p-4">
                  <p className="text-sm text-muted-foreground">Situação</p>
                  <Badge
                    className={`mt-2 ${
                      data.invoice?.status === 'paid'
                        ? 'bg-white text-[#242830]'
                        : 'bg-[#f4513e] text-white'
                    }`}
                  >
                    {data.invoice?.status === 'paid' ? 'Paga' : 'Em aberto'}
                  </Badge>
                </div>
                <div className="sm:col-span-3">
                  <Button
                    type="button"
                    variant={
                      data.invoice?.status === 'paid' ? 'outline' : 'default'
                    }
                    disabled={
                      !data.invoice?.id ||
                      data.summary.invoiceCents === 0 ||
                      invoiceSaving
                    }
                    onClick={() => void toggleInvoicePayment()}
                    className="w-full"
                  >
                    {invoiceSaving ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <CheckCircle2 />
                    )}
                    {data.invoice?.status === 'paid'
                      ? 'Reabrir fatura'
                      : 'Marcar fatura como paga'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="min-h-80 border-0 shadow-[0_18px_50px_rgba(0,0,0,.2)] ring-1 ring-white/15">
              <CardHeader className="border-b border-white/10 pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ReceiptText className="size-5" />
                  Compras da fatura
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {data.transactions.length}{' '}
                  {data.transactions.length === 1
                    ? 'lançamento'
                    : 'lançamentos'}
                </p>
              </CardHeader>
              <CardContent className="px-0">
                {loading ? (
                  <div className="grid h-56 place-items-center">
                    <LoaderCircle className="size-7 animate-spin" />
                  </div>
                ) : data.transactions.length === 0 ? (
                  <div className="grid h-56 place-items-center px-6 text-center">
                    <div>
                      <ShieldCheck className="mx-auto mb-3 size-9 text-white/70" />
                      <p className="font-semibold">
                        Nenhuma compra nesta fatura
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Compras e parcelas aparecerão aqui automaticamente.
                      </p>
                    </div>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-5">Compra</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Parcela</TableHead>
                        <TableHead className="pr-5 text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.transactions.map((transaction) => (
                        <TableRow key={transaction.id}>
                          <TableCell className="pl-5 font-medium">
                            {transaction.description}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDate(transaction.purchaseDate)}
                          </TableCell>
                          <TableCell>
                            {transaction.installmentNumber}/
                            {transaction.installmentCount}
                          </TableCell>
                          <TableCell className="pr-5 text-right font-semibold tabular-nums">
                            {formatCurrency(transaction.amountCents)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <Dialog open={newCardOpen} onOpenChange={setNewCardOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo cartão de crédito</DialogTitle>
            <DialogDescription>
              Os dados serão vinculados somente à sua conta.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={createCard}>
            <div className="space-y-2">
              <Label htmlFor="card-name">Nome do cartão</Label>
              <Input
                id="card-name"
                name="cardName"
                required
                minLength={2}
                maxLength={50}
                placeholder="Ex.: Cartão principal"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="card-brand">Bandeira</Label>
                <Input
                  id="card-brand"
                  name="brand"
                  required
                  placeholder="Ex.: Visa"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="card-last-four">Últimos 4 números</Label>
                <Input
                  id="card-last-four"
                  name="lastFour"
                  required
                  inputMode="numeric"
                  pattern="\d{4}"
                  maxLength={4}
                  placeholder="1234"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="card-limit">Limite total</Label>
              <Input
                id="card-limit"
                name="creditLimit"
                required
                inputMode="decimal"
                placeholder="R$ 0,00"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="closing-day">Dia do fechamento</Label>
                <Input
                  id="closing-day"
                  name="closingDay"
                  required
                  type="number"
                  min={1}
                  max={28}
                  placeholder="10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="due-day">Dia do vencimento</Label>
                <Input
                  id="due-day"
                  name="dueDay"
                  required
                  type="number"
                  min={1}
                  max={28}
                  placeholder="17"
                />
              </div>
            </div>
            {error && (
              <output
                aria-live="polite"
                className="flex items-start gap-2 rounded-lg bg-red-950/70 px-3 py-2.5 text-sm text-red-200"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                {error}
              </output>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setNewCardOpen(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <LoaderCircle className="animate-spin" />}
                Salvar cartão
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  featured = false,
}: {
  label: string;
  value: string;
  detail?: string;
  icon: ReactNode;
  featured?: boolean;
}) {
  return (
    <Card
      className={`border-0 shadow-[0_18px_45px_rgba(0,0,0,.18)] ring-1 ${
        featured ? 'bg-white text-[#242830] ring-white/40' : 'ring-white/15'
      }`}
    >
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div>
          <p
            className={`text-sm ${
              featured ? 'text-[#4b505b]' : 'text-muted-foreground'
            }`}
          >
            {label}
          </p>
          <p className="mt-2 text-2xl font-bold tracking-[-0.04em] tabular-nums">
            {value}
          </p>
          {detail && (
            <p
              className={`mt-1 text-xs ${
                featured ? 'text-[#606671]' : 'text-muted-foreground'
              }`}
            >
              {detail}
            </p>
          )}
        </div>
        <span
          className={`grid size-9 shrink-0 place-items-center rounded-lg ${
            featured ? 'bg-[#242830] text-white' : 'bg-white/10 text-white'
          }`}
        >
          {icon}
        </span>
      </CardContent>
    </Card>
  );
}

function InvoiceDate({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-xl bg-white/8 p-4">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon} {label}
      </span>
      <p className="mt-2 font-semibold capitalize">{value}</p>
    </div>
  );
}
