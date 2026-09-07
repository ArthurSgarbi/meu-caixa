import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getDb } from '@/db';
import {
  simulateDebt,
  simulateInvestment,
} from '@/lib/simulation-calculations';

export const dynamic = 'force-dynamic';

type SimulationType = 'debt' | 'investment';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function safeJson(value: unknown) {
  try {
    return typeof value === 'string' ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function validateMoney(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function validateRate(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 100
    ? number
    : null;
}

function buildSimulation(type: SimulationType, input: Record<string, unknown>) {
  if (type === 'debt') {
    const principalCents = validateMoney(input.principalCents);
    const monthlyRatePercent = validateRate(input.monthlyRatePercent);
    const months = Number(input.months);
    if (
      principalCents === null ||
      principalCents === 0 ||
      monthlyRatePercent === null ||
      !Number.isInteger(months) ||
      months < 1 ||
      months > 120
    ) {
      throw new Error('Dados da simulação de dívida são inválidos.');
    }
    const simulation = simulateDebt(principalCents, monthlyRatePercent, months);
    return {
      input: { principalCents, monthlyRatePercent, months },
      result: {
        finalAmountCents: simulation.finalAmountCents,
        totalInterestCents: simulation.totalInterestCents,
      },
    };
  }

  const initialValueCents = validateMoney(input.initialValueCents);
  const monthlyContributionCents = validateMoney(
    input.monthlyContributionCents,
  );
  const monthlyRatePercent = validateRate(input.monthlyRatePercent);
  const futureExpenseCents = validateMoney(input.futureExpenseCents);
  const durationValue = Number(input.durationValue);
  const durationUnit = input.durationUnit === 'years' ? 'years' : 'months';
  const goalName =
    typeof input.goalName === 'string' && input.goalName.trim()
      ? input.goalName.trim().slice(0, 60)
      : 'Gasto futuro';
  const months = durationUnit === 'years' ? durationValue * 12 : durationValue;

  if (
    initialValueCents === null ||
    monthlyContributionCents === null ||
    (initialValueCents === 0 && monthlyContributionCents === 0) ||
    monthlyRatePercent === null ||
    futureExpenseCents === null ||
    !Number.isInteger(durationValue) ||
    durationValue < 1 ||
    !Number.isInteger(months) ||
    months > 600
  ) {
    throw new Error('Dados da simulação de investimento são inválidos.');
  }

  const simulation = simulateInvestment(
    initialValueCents,
    monthlyContributionCents,
    monthlyRatePercent,
    months,
  );
  return {
    input: {
      initialValueCents,
      monthlyContributionCents,
      monthlyRatePercent,
      durationValue,
      durationUnit,
      futureExpenseCents,
      goalName,
    },
    result: {
      finalAmountCents: simulation.finalAmountCents,
      totalContributedCents: simulation.totalContributedCents,
      totalEarningsCents: simulation.totalEarningsCents,
      comparisonCents: simulation.finalAmountCents - futureExpenseCents,
    },
  };
}

export async function GET() {
  try {
    const user = await getChatGPTUser();
    if (!user) {
      return Response.json(
        { error: 'Entre na sua conta para ver as simulações salvas.' },
        { status: 401 },
      );
    }

    const result = await getDb()
      .prepare(
        `SELECT id, name, simulation_type AS simulationType,
                input_json AS inputJson, result_json AS resultJson,
                updated_at AS updatedAt
           FROM saved_simulations
          WHERE owner_id = ?
          ORDER BY updated_at DESC, id DESC
          LIMIT 30`,
      )
      .bind(user.userId)
      .all();

    return Response.json({
      simulations: result.results.map((row) => ({
        id: Number(row.id),
        name: String(row.name),
        simulationType: String(row.simulationType),
        input: safeJson(row.inputJson),
        result: safeJson(row.resultJson),
        updatedAt: String(row.updatedAt),
      })),
    });
  } catch (error) {
    console.error('Failed to load saved simulations', error);
    return Response.json(
      { error: 'Não foi possível carregar as simulações salvas.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) {
      return Response.json(
        { error: 'Entre na sua conta para salvar uma simulação.' },
        { status: 401 },
      );
    }

    const body = asRecord(await request.json());
    const type = body?.simulationType;
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const input = asRecord(body?.input);

    if (type !== 'debt' && type !== 'investment') {
      return Response.json(
        { error: 'Escolha um tipo de simulação válido.' },
        { status: 400 },
      );
    }
    if (name.length < 2 || name.length > 80) {
      return Response.json(
        { error: 'Dê um nome de 2 a 80 caracteres para o cenário.' },
        { status: 400 },
      );
    }
    if (!input) {
      return Response.json(
        { error: 'Informe os dados da simulação.' },
        { status: 400 },
      );
    }

    let simulation;
    try {
      simulation = buildSimulation(type, input);
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'Dados da simulação são inválidos.',
        },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const db = getDb();
    await db
      .prepare(
        `INSERT INTO saved_simulations
          (owner_id, name, simulation_type, input_json, result_json,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(owner_id, name) DO UPDATE SET
           simulation_type = excluded.simulation_type,
           input_json = excluded.input_json,
           result_json = excluded.result_json,
           updated_at = excluded.updated_at`,
      )
      .bind(
        user.userId,
        name,
        type,
        JSON.stringify(simulation.input),
        JSON.stringify(simulation.result),
        now,
        now,
      )
      .run();

    const saved = await db
      .prepare(
        `SELECT id, updated_at AS updatedAt
           FROM saved_simulations
          WHERE owner_id = ? AND name = ?`,
      )
      .bind(user.userId, name)
      .first();

    return Response.json(
      {
        id: Number(saved?.id),
        updatedAt: String(saved?.updatedAt),
        result: simulation.result,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Failed to save simulation', error);
    return Response.json(
      { error: 'Não foi possível salvar a simulação.' },
      { status: 500 },
    );
  }
}
