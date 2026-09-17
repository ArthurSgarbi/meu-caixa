import { getDb } from '@/db';
import { getChatGPTUser } from '@/app/chatgpt-auth';

export const dynamic = 'force-dynamic';

const assetClasses = new Set([
  'Renda fixa',
  'Ações',
  'Fundos imobiliários',
  'Criptoativos',
  'Outros',
]);

type InvestmentInput = {
  name: string;
  assetClass: string;
  investedCents: number;
  currentValueCents: number;
  ticker: string | null;
  quantity: number | null;
  acquisitionDate: string;
};

const tickerPattern = /^[A-Z0-9]{4,12}$/;

function parseInvestmentInput(
  body: Record<string, unknown>,
): { input: InvestmentInput } | { error: string } {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const assetClass = typeof body.assetClass === 'string' ? body.assetClass : '';
  const investedCents = Number(body.investedCents);
  const currentValueCents = Number(body.currentValueCents);
  const tickerValue =
    typeof body.ticker === 'string' ? body.ticker.trim().toUpperCase() : '';
  const quantityValue = Number(body.quantity);
  const hasTicker = tickerValue.length > 0;
  const hasQuantity = Number.isFinite(quantityValue) && quantityValue > 0;
  const acquisitionDate =
    typeof body.acquisitionDate === 'string' ? body.acquisitionDate : '';

  if (name.length < 2 || name.length > 80) {
    return { error: 'Informe um nome entre 2 e 80 caracteres.' };
  }
  if (!assetClasses.has(assetClass)) {
    return { error: 'Selecione uma classe de investimento válida.' };
  }
  if (!Number.isSafeInteger(investedCents) || investedCents <= 0) {
    return { error: 'Informe um valor aplicado maior que zero.' };
  }
  if (!Number.isSafeInteger(currentValueCents) || currentValueCents < 0) {
    return { error: 'Informe um valor atual válido.' };
  }
  if (hasTicker !== hasQuantity) {
    return {
      error: 'Para acompanhar ao vivo, informe o código B3 e a quantidade.',
    };
  }
  if (hasTicker && !tickerPattern.test(tickerValue)) {
    return { error: 'Informe um código B3 válido, como PETR4 ou MXRF11.' };
  }
  if (hasQuantity && quantityValue > 1_000_000_000) {
    return { error: 'Informe uma quantidade válida para o ativo.' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(acquisitionDate)) {
    return { error: 'Informe uma data de aquisição válida.' };
  }

  return {
    input: {
      name,
      assetClass,
      investedCents,
      currentValueCents,
      ticker: hasTicker ? tickerValue : null,
      quantity: hasQuantity ? quantityValue : null,
      acquisitionDate,
    },
  };
}

export async function GET() {
  try {
    const user = await getChatGPTUser();
    if (!user) {
      return Response.json(
        { error: 'Entre na sua conta para acessar seus investimentos.' },
        { status: 401 },
      );
    }

    const db = getDb();
    const [investmentsResult, summaryResult, allocationResult] =
      await Promise.all([
        db
          .prepare(
            `SELECT id, name, asset_class AS assetClass,
                    invested_cents AS investedCents,
                    current_value_cents AS currentValueCents,
                    ticker, quantity::double precision AS quantity,
                    acquisition_date AS acquisitionDate
               FROM investments
              WHERE owner_id = ?
              ORDER BY current_value_cents DESC, id DESC`,
          )
          .bind(user.userId)
          .all(),
        db
          .prepare(
            `SELECT COALESCE(SUM(invested_cents), 0) AS investedCents,
                    COALESCE(SUM(current_value_cents), 0) AS currentValueCents
               FROM investments
              WHERE owner_id = ?`,
          )
          .bind(user.userId)
          .first(),
        db
          .prepare(
            `SELECT asset_class AS assetClass,
                    SUM(current_value_cents) AS currentValueCents
               FROM investments
              WHERE owner_id = ?
              GROUP BY asset_class
              ORDER BY SUM(current_value_cents) DESC`,
          )
          .bind(user.userId)
          .all(),
      ]);

    const investedCents = Number(summaryResult?.investedCents ?? 0);
    const currentValueCents = Number(summaryResult?.currentValueCents ?? 0);
    const profitCents = currentValueCents - investedCents;

    return Response.json({
      investments: investmentsResult.results,
      allocation: allocationResult.results,
      summary: {
        investedCents,
        currentValueCents,
        profitCents,
        returnPercentage:
          investedCents > 0 ? (profitCents / investedCents) * 100 : 0,
      },
    });
  } catch (error) {
    console.error('Failed to load investments', error);
    return Response.json(
      { error: 'Não foi possível carregar seus investimentos.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) {
      return Response.json(
        { error: 'Entre na sua conta para registrar um investimento.' },
        { status: 401 },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const parsed = parseInvestmentInput(body);
    if ('error' in parsed) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }
    const {
      name,
      assetClass,
      investedCents,
      currentValueCents,
      ticker,
      quantity,
      acquisitionDate,
    } = parsed.input;

    const db = getDb();
    const now = new Date().toISOString();
    const result = await db
      .prepare(
        `INSERT INTO investments
          (name, asset_class, invested_cents, current_value_cents,
           ticker, quantity, acquisition_date, owner_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        name,
        assetClass,
        investedCents,
        currentValueCents,
        ticker,
        quantity,
        acquisitionDate,
        user.userId,
        now,
        now,
      )
      .run();

    return Response.json({ id: result.meta.last_row_id }, { status: 201 });
  } catch (error) {
    console.error('Failed to create investment', error);
    return Response.json(
      { error: 'Não foi possível registrar o investimento.' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) {
      return Response.json(
        { error: 'Entre na sua conta para editar um investimento.' },
        { status: 401 },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const id = Number(body.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return Response.json(
        { error: 'Investimento inválido para edição.' },
        { status: 400 },
      );
    }

    const parsed = parseInvestmentInput(body);
    if ('error' in parsed) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }
    const {
      name,
      assetClass,
      investedCents,
      currentValueCents,
      ticker,
      quantity,
      acquisitionDate,
    } = parsed.input;

    const db = getDb();
    const result = await db
      .prepare(
        `UPDATE investments
            SET name = ?, asset_class = ?, invested_cents = ?,
                current_value_cents = ?, ticker = ?, quantity = ?,
                acquisition_date = ?, updated_at = ?
          WHERE id = ? AND owner_id = ?`,
      )
      .bind(
        name,
        assetClass,
        investedCents,
        currentValueCents,
        ticker,
        quantity,
        acquisitionDate,
        new Date().toISOString(),
        id,
        user.userId,
      )
      .run();

    if (result.meta.changes === 0) {
      return Response.json(
        { error: 'Investimento não encontrado.' },
        { status: 404 },
      );
    }

    return Response.json({ id, updated: true });
  } catch (error) {
    console.error('Failed to update investment', error);
    return Response.json(
      { error: 'Não foi possível salvar as alterações do investimento.' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) {
      return Response.json(
        { error: 'Entre na sua conta para remover um investimento.' },
        { status: 401 },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const id = Number(body.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return Response.json(
        { error: 'Investimento inválido para remoção.' },
        { status: 400 },
      );
    }

    const db = getDb();
    const result = await db
      .prepare('DELETE FROM investments WHERE id = ? AND owner_id = ?')
      .bind(id, user.userId)
      .run();

    if (result.meta.changes === 0) {
      return Response.json(
        { error: 'Investimento não encontrado.' },
        { status: 404 },
      );
    }

    return Response.json({ id, deleted: true });
  } catch (error) {
    console.error('Failed to delete investment', error);
    return Response.json(
      { error: 'Não foi possível remover o investimento.' },
      { status: 500 },
    );
  }
}
