import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getDb } from '@/db';
import {
  backupTables,
  validateBackup,
  type BackupTableName,
} from '@/lib/user-backup';

export const dynamic = 'force-dynamic';

const categoryTables = new Set<BackupTableName>([
  'recurring_rules',
  'transactions',
  'budgets',
]);

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json({ error: 'Entre na sua conta.' }, { status: 401 });
  const mode = new URL(request.url).searchParams.get('mode');
  if (mode !== 'preview' && mode !== 'restore')
    return Response.json({ error: 'Modo inválido.' }, { status: 400 });
  if (Number(request.headers.get('content-length') ?? 0) > 2_000_000)
    return Response.json({ error: 'Arquivo maior que 2 MB.' }, { status: 413 });
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > 2_000_000)
      return Response.json(
        { error: 'Arquivo maior que 2 MB.' },
        { status: 413 },
      );
    const backup = validateBackup(JSON.parse(raw) as unknown, user.userId);
    const db = getDb();
    const sourceCategories = new Map(
      backup.categories.map((row) => [row.id, row]),
    );
    const invalidRuleCategory = backup.data.recurring_rules.some(
      (row) => sourceCategories.get(Number(row.category_id))?.type !== row.type,
    );
    const invalidTransactionCategory = backup.data.transactions.some((row) => {
      const category = sourceCategories.get(Number(row.category_id));
      return (
        !category ||
        (row.type === 'transfer'
          ? category.slug !== 'investimentos'
          : category.type !== row.type)
      );
    });
    const invalidBudgetCategory = backup.data.budgets.some((row) => {
      const category = sourceCategories.get(Number(row.category_id));
      return (
        !category ||
        category.type !== 'expense' ||
        category.slug === 'investimentos'
      );
    });
    if (
      invalidRuleCategory ||
      invalidTransactionCategory ||
      invalidBudgetCategory
    )
      return Response.json(
        { error: 'Categorias e tipos não correspondem no backup.' },
        { status: 400 },
      );
    const categories = await db
      .prepare('SELECT id, slug, type FROM categories')
      .all();
    const targetCategories = new Map(
      categories.results.map((row) => [
        `${String(row.slug)}:${String(row.type)}`,
        Number(row.id),
      ]),
    );
    const categoryIds = new Map(
      backup.categories.map((row) => [
        row.id,
        targetCategories.get(`${row.slug}:${row.type}`),
      ]),
    );
    for (const table of backupTables) {
      if (
        categoryTables.has(table.name) &&
        backup.data[table.name].some(
          (row) => !categoryIds.get(Number(row.category_id)),
        )
      ) {
        return Response.json(
          { error: 'Uma categoria do backup não existe neste banco.' },
          { status: 400 },
        );
      }
    }
    const ruleIds = new Set(
      backup.data.recurring_rules.map((row) => Number(row.id)),
    );
    const walletIds = new Set(
      backup.data.investment_wallets.map((row) => Number(row.id)),
    );
    const cardIds = new Set(
      backup.data.credit_cards.map((row) => Number(row.id)),
    );
    const invoiceIds = new Set(
      backup.data.credit_card_invoices.map((row) => Number(row.id)),
    );
    const invoiceCardIds = new Map(
      backup.data.credit_card_invoices.map((row) => [
        Number(row.id),
        Number(row.card_id),
      ]),
    );
    if (
      backup.data.transactions.some(
        (row) =>
          row.recurring_rule_id !== null &&
          !ruleIds.has(Number(row.recurring_rule_id)),
      ) ||
      backup.data.investment_contributions.some(
        (row) => !walletIds.has(Number(row.wallet_id)),
      ) ||
      backup.data.credit_card_invoices.some(
        (row) => !cardIds.has(Number(row.card_id)),
      ) ||
      backup.data.credit_card_transactions.some(
        (row) =>
          !cardIds.has(Number(row.card_id)) ||
          !invoiceIds.has(Number(row.invoice_id)) ||
          invoiceCardIds.get(Number(row.invoice_id)) !== Number(row.card_id),
      )
    ) {
      return Response.json(
        { error: 'O backup possui vínculos incompletos.' },
        { status: 400 },
      );
    }
    const missing = {} as Record<BackupTableName, Record<string, unknown>[]>;
    const counts = {} as Record<
      BackupTableName,
      { total: number; missing: number }
    >;
    for (const table of backupTables) {
      const rows = backup.data[table.name];
      const ids = rows.map((row) => Number(row.id));
      const existing = ids.length
        ? await db
            .prepare(
              `SELECT id, owner_id FROM ${table.name} WHERE id IN (${ids.map(() => '?').join(', ')})`,
            )
            .bind(...ids)
            .all()
        : { results: [] };
      if (existing.results.some((row) => row.owner_id !== user.userId))
        return Response.json(
          {
            error: `Conflito de IDs em ${table.name}. Nenhum dado foi alterado.`,
          },
          { status: 409 },
        );
      const existingIds = new Set(
        existing.results.map((row) => Number(row.id)),
      );
      missing[table.name] = rows.filter(
        (row) => !existingIds.has(Number(row.id)),
      );
      counts[table.name] = {
        total: rows.length,
        missing: missing[table.name].length,
      };
    }
    const totalMissing = Object.values(counts).reduce(
      (sum, item) => sum + item.missing,
      0,
    );
    if (mode === 'preview')
      return Response.json(
        {
          counts,
          totalMissing,
          action:
            'Somente registros ausentes serão adicionados; os atuais não serão apagados nem sobrescritos.',
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    if (totalMissing) {
      const statements = [];
      for (const table of backupTables) {
        const rows = missing[table.name];
        for (let offset = 0; offset < rows.length; offset += 50) {
          const chunk = rows.slice(offset, offset + 50);
          const values = chunk.flatMap((row) =>
            table.columns.map((column) =>
              column === 'category_id' && categoryTables.has(table.name)
                ? categoryIds.get(Number(row.category_id))
                : row[column],
            ),
          );
          const tuple = `(${table.columns.map(() => '?').join(', ')})`;
          statements.push(
            db
              .prepare(
                `INSERT INTO ${table.name} (${table.columns.join(', ')}) VALUES ${chunk.map(() => tuple).join(', ')} ON CONFLICT (id) DO NOTHING`,
              )
              .bind(...values),
          );
        }
        if (rows.length)
          statements.push(
            db.prepare(
              `SELECT setval(pg_get_serial_sequence('public.${table.name}', 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM ${table.name}), (SELECT last_value FROM public.${table.name}_id_seq)), true)`,
            ),
          );
      }
      // O lote inteiro é uma transação: erro de vínculo/índice desfaz todas as inserções.
      await db.batch(statements);
    }
    return Response.json(
      { restored: true, counts, totalMissing },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof SyntaxError)
      return Response.json({ error: 'JSON inválido.' }, { status: 400 });
    if (
      error instanceof Error &&
      /backup|registro|campo|categoria|tabela|versão|arquivo/i.test(
        error.message,
      )
    )
      return Response.json({ error: error.message }, { status: 400 });
    console.error('Failed to restore user data', error);
    return Response.json(
      {
        error: 'Não foi possível restaurar. Nenhum lote parcial foi aplicado.',
      },
      { status: 500 },
    );
  }
}
