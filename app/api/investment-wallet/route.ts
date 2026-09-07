import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getDb } from '@/db';
import { calculateDailyYield } from '@/lib/investment-calculations';

export const dynamic = 'force-dynamic';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const defaultAnnualCdiRate = 10.5;
const defaultCdbPercentage = 100;

function numberFromBps(value: unknown, fallback: number) {
  return value === null || value === undefined ? fallback : Number(value) / 100;
}

export async function GET() {
  try {
    const user = await getChatGPTUser();
    if (!user) {
      return Response.json(
        { error: 'Entre na sua conta para acessar seus rendimentos.' },
        { status: 401 },
      );
    }

    const db = getDb();
    const [wallet, contributionsResult, mainBalanceResult] = await Promise.all([
      db
        .prepare(
          `SELECT id, balance_cents AS balanceCents,
                  annual_cdi_rate_bps AS annualCdiRateBps,
                  cdb_percentage_bps AS cdbPercentageBps
             FROM investment_wallets
            WHERE owner_id = ?`,
        )
        .bind(user.userId)
        .first(),
      db
        .prepare(
          `SELECT id, description, amount_cents AS amountCents,
                  contribution_date AS contributionDate
             FROM investment_contributions
            WHERE owner_id = ?
            ORDER BY contribution_date DESC, id DESC
            LIMIT 24`,
        )
        .bind(user.userId)
        .all(),
      db
        .prepare(
          `SELECT COALESCE(
              SUM(CASE WHEN type = 'income' THEN amount_cents
                       ELSE -amount_cents END), 0
            ) AS balanceCents
             FROM transactions
            WHERE owner_id = ?`,
        )
        .bind(user.userId)
        .first(),
    ]);

    const balanceCents = Number(wallet?.balanceCents ?? 0);
    const annualCdiRate = numberFromBps(
      wallet?.annualCdiRateBps,
      defaultAnnualCdiRate,
    );
    const cdbPercentage = numberFromBps(
      wallet?.cdbPercentageBps,
      defaultCdbPercentage,
    );
    const dailyYield = calculateDailyYield(
      balanceCents,
      annualCdiRate,
      cdbPercentage,
    );

    return Response.json({
      wallet: {
        balanceCents,
        annualCdiRate,
        cdbPercentage,
        ...dailyYield,
      },
      mainBalanceCents: Number(mainBalanceResult?.balanceCents ?? 0),
      contributions: contributionsResult.results,
    });
  } catch (error) {
    console.error('Failed to load investment wallet', error);
    return Response.json(
      { error: 'Não foi possível carregar o calculador de rendimentos.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) {
      return Response.json(
        { error: 'Entre na sua conta para realizar um aporte.' },
        { status: 401 },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const amountCents = Number(body.amountCents);
    const contributionDate =
      typeof body.contributionDate === 'string' ? body.contributionDate : '';
    const description =
      typeof body.description === 'string' ? body.description.trim() : '';

    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
      return Response.json(
        { error: 'Informe um valor de aporte maior que zero.' },
        { status: 400 },
      );
    }
    if (!datePattern.test(contributionDate)) {
      return Response.json(
        { error: 'Informe uma data de aporte válida.' },
        { status: 400 },
      );
    }
    if (description.length < 2 || description.length > 80) {
      return Response.json(
        { error: 'Informe uma descrição entre 2 e 80 caracteres.' },
        { status: 400 },
      );
    }

    const db = getDb();
    const now = new Date().toISOString();
    await db.batch([
      db
        .prepare(
          `INSERT OR IGNORE INTO categories
            (slug, name, type, created_at)
           VALUES ('investimentos', 'Investimentos', 'expense', ?)`,
        )
        .bind(now),
      db
        .prepare(
          `INSERT OR IGNORE INTO investment_wallets
            (owner_id, balance_cents, annual_cdi_rate_bps,
             cdb_percentage_bps, created_at, updated_at)
           VALUES (?, 0, 1050, 10000, ?, ?)`,
        )
        .bind(user.userId, now, now),
    ]);

    const [mainBalanceResult, category, wallet] = await Promise.all([
      db
        .prepare(
          `SELECT COALESCE(
              SUM(CASE WHEN type = 'income' THEN amount_cents
                       ELSE -amount_cents END), 0
            ) AS balanceCents
             FROM transactions
            WHERE owner_id = ?`,
        )
        .bind(user.userId)
        .first(),
      db
        .prepare(
          `SELECT id FROM categories
            WHERE slug = 'investimentos' AND type = 'expense'`,
        )
        .first(),
      db
        .prepare('SELECT id FROM investment_wallets WHERE owner_id = ?')
        .bind(user.userId)
        .first(),
    ]);

    const mainBalanceCents = Number(mainBalanceResult?.balanceCents ?? 0);
    if (amountCents > mainBalanceCents) {
      return Response.json(
        {
          error: `Saldo insuficiente. Disponível: R$ ${(mainBalanceCents / 100)
            .toFixed(2)
            .replace('.', ',')}.`,
        },
        { status: 400 },
      );
    }
    if (!category?.id || !wallet?.id) {
      throw new Error('Investment transfer dependencies unavailable');
    }

    // As três operações formam uma única transferência financeira:
    // registra a saída, credita a carteira e preserva o histórico do aporte.
    await db.batch([
      db
        .prepare(
          `INSERT INTO transactions
            (description, type, amount_cents, transaction_date, category_id,
             owner_id, created_at)
           VALUES (?, 'expense', ?, ?, ?, ?, ?)`,
        )
        .bind(
          `Investimento: ${description}`,
          amountCents,
          contributionDate,
          Number(category.id),
          user.userId,
          now,
        ),
      db
        .prepare(
          `UPDATE investment_wallets
              SET balance_cents = balance_cents + ?, updated_at = ?
            WHERE id = ? AND owner_id = ?`,
        )
        .bind(amountCents, now, Number(wallet.id), user.userId),
      db
        .prepare(
          `INSERT INTO investment_contributions
            (wallet_id, owner_id, description, amount_cents,
             contribution_date, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          Number(wallet.id),
          user.userId,
          description,
          amountCents,
          contributionDate,
          now,
        ),
    ]);

    return Response.json(
      {
        transferredCents: amountCents,
        mainBalanceCents: mainBalanceCents - amountCents,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Failed to transfer investment contribution', error);
    return Response.json(
      { error: 'Não foi possível transferir o aporte.' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) {
      return Response.json(
        { error: 'Entre na sua conta para salvar as taxas.' },
        { status: 401 },
      );
    }
    const body = (await request.json()) as Record<string, unknown>;
    const annualCdiRate = Number(body.annualCdiRate);
    const cdbPercentage = Number(body.cdbPercentage);

    if (
      !Number.isFinite(annualCdiRate) ||
      annualCdiRate < 0 ||
      annualCdiRate > 100
    ) {
      return Response.json(
        { error: 'A taxa anual do CDI deve estar entre 0% e 100%.' },
        { status: 400 },
      );
    }
    if (
      !Number.isFinite(cdbPercentage) ||
      cdbPercentage < 0 ||
      cdbPercentage > 500
    ) {
      return Response.json(
        { error: 'O percentual do CDB deve estar entre 0% e 500% do CDI.' },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const annualCdiRateBps = Math.round(annualCdiRate * 100);
    const cdbPercentageBps = Math.round(cdbPercentage * 100);
    await getDb()
      .prepare(
        `INSERT INTO investment_wallets
          (owner_id, balance_cents, annual_cdi_rate_bps,
           cdb_percentage_bps, created_at, updated_at)
         VALUES (?, 0, ?, ?, ?, ?)
         ON CONFLICT(owner_id) DO UPDATE SET
           annual_cdi_rate_bps = excluded.annual_cdi_rate_bps,
           cdb_percentage_bps = excluded.cdb_percentage_bps,
           updated_at = excluded.updated_at`,
      )
      .bind(user.userId, annualCdiRateBps, cdbPercentageBps, now, now)
      .run();

    return Response.json({
      annualCdiRate: annualCdiRateBps / 100,
      cdbPercentage: cdbPercentageBps / 100,
    });
  } catch (error) {
    console.error('Failed to update investment rates', error);
    return Response.json(
      { error: 'Não foi possível salvar as taxas.' },
      { status: 500 },
    );
  }
}
