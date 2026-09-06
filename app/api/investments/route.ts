import { getDb } from '@/db';

const assetClasses = new Set([
  'Renda fixa',
  'Ações',
  'Fundos imobiliários',
  'Criptoativos',
  'Outros',
]);

export async function GET() {
  try {
    const db = getDb();
    const [investmentsResult, summaryResult, allocationResult] =
      await Promise.all([
        db
          .prepare(
            `SELECT id, name, asset_class AS assetClass,
                    invested_cents AS investedCents,
                    current_value_cents AS currentValueCents,
                    acquisition_date AS acquisitionDate
               FROM investments
              ORDER BY current_value_cents DESC, id DESC`,
          )
          .all(),
        db
          .prepare(
            `SELECT COALESCE(SUM(invested_cents), 0) AS investedCents,
                    COALESCE(SUM(current_value_cents), 0) AS currentValueCents
               FROM investments`,
          )
          .first(),
        db
          .prepare(
            `SELECT asset_class AS assetClass,
                    SUM(current_value_cents) AS currentValueCents
               FROM investments
              GROUP BY asset_class
              ORDER BY currentValueCents DESC`,
          )
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
    const body = (await request.json()) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const assetClass =
      typeof body.assetClass === 'string' ? body.assetClass : '';
    const investedCents = Number(body.investedCents);
    const currentValueCents = Number(body.currentValueCents);
    const acquisitionDate =
      typeof body.acquisitionDate === 'string' ? body.acquisitionDate : '';

    if (name.length < 2 || name.length > 80) {
      return Response.json(
        { error: 'Informe um nome entre 2 e 80 caracteres.' },
        { status: 400 },
      );
    }
    if (!assetClasses.has(assetClass)) {
      return Response.json(
        { error: 'Selecione uma classe de investimento válida.' },
        { status: 400 },
      );
    }
    if (!Number.isSafeInteger(investedCents) || investedCents <= 0) {
      return Response.json(
        { error: 'Informe um valor aplicado maior que zero.' },
        { status: 400 },
      );
    }
    if (!Number.isSafeInteger(currentValueCents) || currentValueCents < 0) {
      return Response.json(
        { error: 'Informe um valor atual válido.' },
        { status: 400 },
      );
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(acquisitionDate)) {
      return Response.json(
        { error: 'Informe uma data de aquisição válida.' },
        { status: 400 },
      );
    }

    const db = getDb();
    const now = new Date().toISOString();
    const result = await db
      .prepare(
        `INSERT INTO investments
          (name, asset_class, invested_cents, current_value_cents,
           acquisition_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        name,
        assetClass,
        investedCents,
        currentValueCents,
        acquisitionDate,
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
