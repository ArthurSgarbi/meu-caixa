import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getDb, type Database } from '@/db';
import { ASSISTANT_SYSTEM_PROMPT } from '@/lib/assistant-system-prompt';

export const dynamic = 'force-dynamic';

type ChatRole = 'user' | 'assistant';

type ChatMessage = {
  role: ChatRole;
  content: string;
};

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  error?: { message?: string };
};

const MAX_MESSAGE_LENGTH = 2_000;
const MAX_HISTORY_MESSAGES = 8;
const MAX_HISTORY_MESSAGE_LENGTH = 1_000;

function getMonthRange() {
  const month = new Date().toISOString().slice(0, 7);
  const [year, monthNumber] = month.split('-').map(Number);
  const start = `${month}-01`;
  const next = new Date(Date.UTC(year, monthNumber, 1))
    .toISOString()
    .slice(0, 10);
  return { month, start, next };
}

function parseHistory(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];

  return value.slice(-MAX_HISTORY_MESSAGES).flatMap((item): ChatMessage[] => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as Record<string, unknown>;
    const role = candidate.role;
    const content =
      typeof candidate.content === 'string'
        ? candidate.content.trim().slice(0, MAX_HISTORY_MESSAGE_LENGTH)
        : '';
    if ((role !== 'user' && role !== 'assistant') || !content) return [];
    return [{ role, content }];
  });
}

async function hashSafetyIdentifier(userId: string) {
  const bytes = new TextEncoder().encode(userId);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

function extractOutputText(response: OpenAIResponse) {
  if (typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text.trim();
  }

  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === 'output_text' && item.text)
    .map((item) => item.text)
    .join('\n')
    .trim();
}

async function loadFinancialContext(db: Database, ownerId: string) {
  const { month, start, next } = getMonthRange();

  // Todas as consultas pessoais exigem owner_id. Essa é a barreira que impede
  // que a assistente misture os dados de contas diferentes.
  const [
    monthlySummary,
    accountBalance,
    topCategories,
    recentTransactions,
    cardsResult,
    wallet,
    investments,
  ] = await Promise.all([
    db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END), 0) AS "incomeCents",
           COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END), 0) AS "expenseCents"
         FROM transactions
         WHERE owner_id = ?
           AND transaction_date >= ? AND transaction_date < ?`,
      )
      .bind(ownerId, start, next)
      .first(),
    db
      .prepare(
        `SELECT COALESCE(
           SUM(CASE WHEN type = 'income' THEN amount_cents ELSE -amount_cents END), 0
         ) AS "balanceCents"
         FROM transactions WHERE owner_id = ?`,
      )
      .bind(ownerId)
      .first(),
    db
      .prepare(
        `SELECT c.name AS category, SUM(t.amount_cents) AS "totalCents"
         FROM transactions t
         JOIN categories c ON c.id = t.category_id
         WHERE t.owner_id = ? AND t.type = 'expense'
           AND t.transaction_date >= ? AND t.transaction_date < ?
         GROUP BY c.id, c.name
         ORDER BY "totalCents" DESC
         LIMIT 5`,
      )
      .bind(ownerId, start, next)
      .all(),
    db
      .prepare(
        `SELECT t.description, t.type, t.amount_cents AS "amountCents",
                t.transaction_date AS "transactionDate", c.name AS category
         FROM transactions t
         JOIN categories c ON c.id = t.category_id
         WHERE t.owner_id = ?
         ORDER BY t.transaction_date DESC, t.id DESC
         LIMIT 10`,
      )
      .bind(ownerId)
      .all(),
    db
      .prepare(
        `SELECT c.name, c.credit_limit_cents AS "limitTotalCents",
                c.closing_day AS "closingDay", c.due_day AS "dueDay",
                COALESCE(SUM(CASE WHEN i.status != 'paid'
                  THEN t.amount_cents ELSE 0 END), 0) AS "outstandingCents",
                COALESCE(SUM(CASE WHEN i.status != 'paid'
                  AND i.reference_month = ? THEN t.amount_cents ELSE 0 END), 0)
                  AS "currentInvoiceCents",
                COALESCE(SUM(CASE WHEN i.status != 'paid'
                  AND i.reference_month > ? THEN t.amount_cents ELSE 0 END), 0)
                  AS "futureInstallmentsCents"
         FROM credit_cards c
         LEFT JOIN credit_card_invoices i
           ON i.card_id = c.id AND i.owner_id = c.owner_id
         LEFT JOIN credit_card_transactions t
           ON t.invoice_id = i.id AND t.owner_id = c.owner_id
         WHERE c.owner_id = ?
         GROUP BY c.id, c.name, c.credit_limit_cents, c.closing_day, c.due_day
         ORDER BY c.name`,
      )
      .bind(month, month, ownerId)
      .all(),
    db
      .prepare(
        `SELECT balance_cents AS "balanceCents",
                annual_cdi_rate_bps AS "annualCdiRateBps",
                cdb_percentage_bps AS "cdbPercentageBps"
         FROM investment_wallets WHERE owner_id = ?`,
      )
      .bind(ownerId)
      .first(),
    db
      .prepare(
        `SELECT COALESCE(SUM(invested_cents), 0) AS "investedCents",
                COALESCE(SUM(current_value_cents), 0) AS "currentValueCents",
                COUNT(*) AS "assetCount"
         FROM investments WHERE owner_id = ?`,
      )
      .bind(ownerId)
      .first(),
  ]);

  const incomeCents = Number(monthlySummary?.incomeCents ?? 0);
  const expenseCents = Number(monthlySummary?.expenseCents ?? 0);
  const cards = cardsResult.results.map((card) => {
    const limitTotalCents = Number(card.limitTotalCents ?? 0);
    const outstandingCents = Number(card.outstandingCents ?? 0);
    return {
      name: String(card.name),
      limitTotalCents,
      availableCents: limitTotalCents - outstandingCents,
      currentInvoiceCents: Number(card.currentInvoiceCents ?? 0),
      futureInstallmentsCents: Number(card.futureInstallmentsCents ?? 0),
      outstandingCents,
      closingDay: Number(card.closingDay),
      dueDay: Number(card.dueDay),
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    referenceMonth: month,
    monthlySummary: {
      incomeCents,
      expenseCents,
      balanceCents: incomeCents - expenseCents,
    },
    mainAccountBalanceCents: Number(accountBalance?.balanceCents ?? 0),
    topExpenseCategories: topCategories.results,
    recentTransactions: recentTransactions.results,
    creditCards: cards,
    creditCardTotals: cards.reduce(
      (totals, card) => ({
        limitTotalCents: totals.limitTotalCents + card.limitTotalCents,
        availableCents: totals.availableCents + card.availableCents,
        currentInvoiceCents:
          totals.currentInvoiceCents + card.currentInvoiceCents,
        futureInstallmentsCents:
          totals.futureInstallmentsCents + card.futureInstallmentsCents,
      }),
      {
        limitTotalCents: 0,
        availableCents: 0,
        currentInvoiceCents: 0,
        futureInstallmentsCents: 0,
      },
    ),
    investmentWallet: wallet
      ? {
          balanceCents: Number(wallet.balanceCents ?? 0),
          annualCdiRatePercent: Number(wallet.annualCdiRateBps ?? 0) / 100,
          cdbPercentageOfCdi: Number(wallet.cdbPercentageBps ?? 0) / 100,
        }
      : null,
    investmentPortfolio: {
      investedCents: Number(investments?.investedCents ?? 0),
      currentValueCents: Number(investments?.currentValueCents ?? 0),
      assetCount: Number(investments?.assetCount ?? 0),
    },
  };
}

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) {
      return Response.json(
        { error: 'Entre na sua conta para conversar com a assistente.' },
        { status: 401 },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message || message.length > MAX_MESSAGE_LENGTH) {
      return Response.json(
        {
          error: `Escreva uma mensagem de até ${MAX_MESSAGE_LENGTH} caracteres.`,
        },
        { status: 400 },
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json(
        {
          error:
            'A assistente está pronta, mas falta configurar OPENAI_API_KEY no ambiente do servidor.',
        },
        { status: 503 },
      );
    }

    const history = parseHistory(body.history);
    const financialContext = await loadFinancialContext(getDb(), user.userId);
    const safetyIdentifier = await hashSafetyIdentifier(user.userId);

    const openAIResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5.4-mini',
        instructions: `${ASSISTANT_SYSTEM_PROMPT}\n\n<contexto_financeiro>\n${JSON.stringify(financialContext)}\n</contexto_financeiro>`,
        input: [...history, { role: 'user', content: message }],
        max_output_tokens: 700,
        store: false,
        safety_identifier: safetyIdentifier,
      }),
    });

    const responseBody = (await openAIResponse.json()) as OpenAIResponse;
    if (!openAIResponse.ok) {
      console.error('OpenAI response failed', {
        status: openAIResponse.status,
        message: responseBody.error?.message,
      });
      return Response.json(
        { error: 'A IA não conseguiu responder agora. Tente novamente.' },
        { status: 502 },
      );
    }

    const answer = extractOutputText(responseBody);
    if (!answer) {
      return Response.json(
        { error: 'A IA retornou uma resposta vazia. Tente reformular.' },
        { status: 502 },
      );
    }

    return Response.json({
      answer,
      contextUpdatedAt: financialContext.generatedAt,
    });
  } catch (error) {
    console.error('Failed to answer assistant message', error);
    return Response.json(
      { error: 'Não foi possível conversar com a assistente agora.' },
      { status: 500 },
    );
  }
}
