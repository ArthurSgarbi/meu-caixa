import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getDb } from '@/db';
import {
  backupDigest,
  backupTables,
  csvCell,
  type BackupRows,
  type UserBackup,
} from '@/lib/user-backup';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json({ error: 'Entre na sua conta.' }, { status: 401 });
  const format = new URL(request.url).searchParams.get('format');
  if (format !== 'csv' && format !== 'backup')
    return Response.json({ error: 'Formato inválido.' }, { status: 400 });
  try {
    const db = getDb();
    const stamp = new Date().toISOString().slice(0, 10);
    const headers = {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    };
    if (format === 'csv') {
      const rows = await db
        .prepare(`SELECT t.transaction_date AS "date", t.description, t.type,
          t.amount_cents AS "amountCents", c.name AS category, COALESCE(a.name,'Conta principal') AS account
          FROM transactions t JOIN categories c ON c.id = t.category_id
          LEFT JOIN financial_accounts a ON a.id = t.account_id AND a.owner_id = t.owner_id
          WHERE t.owner_id = ? ORDER BY t.transaction_date, t.id`)
        .bind(user.userId)
        .all();
      const lines = [
        'Data;Descrição;Tipo;Categoria;Conta;Valor (R$)',
        ...rows.results.map((row) =>
          [
            csvCell(String(row.date)),
            csvCell(String(row.description)),
            csvCell(
              row.type === 'income'
                ? 'Receita'
                : row.type === 'transfer'
                  ? 'Transferência'
                  : 'Despesa',
            ),
            csvCell(String(row.category)),
            csvCell(String(row.account)),
            csvCell(
              (Number(row.amountCents) / 100).toFixed(2).replace('.', ','),
            ),
          ].join(';'),
        ),
      ];
      return new Response(`\uFEFF${lines.join('\r\n')}\r\n`, {
        headers: {
          ...headers,
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="meu-caixa-transacoes-${stamp}.csv"`,
        },
      });
    }
    const [categoriesResult, ...tableResults] = await Promise.all([
      db.prepare('SELECT id, slug, type FROM categories ORDER BY id').all(),
      ...backupTables.map((table) =>
        db
          .prepare(
            `SELECT ${table.columns.join(', ')} FROM ${table.name} WHERE owner_id = ? ORDER BY id`,
          )
          .bind(user.userId)
          .all(),
      ),
    ]);
    const data = Object.fromEntries(
      backupTables.map((table, index) => [
        table.name,
        tableResults[index].results,
      ]),
    ) as BackupRows;
    const snapshot: UserBackup = {
      format: 'meu-caixa-backup',
      version: 1,
      ownerId: user.userId,
      exportedAt: new Date().toISOString(),
      categories: categoriesResult.results.map((row) => ({
        id: Number(row.id),
        slug: String(row.slug),
        type: String(row.type),
      })),
      data,
      sha256: '',
    };
    snapshot.sha256 = backupDigest(snapshot);
    return new Response(JSON.stringify(snapshot), {
      headers: {
        ...headers,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="meu-caixa-backup-${stamp}.json"`,
      },
    });
  } catch (error) {
    console.error('Failed to export user data', error);
    return Response.json(
      { error: 'Não foi possível exportar os dados.' },
      { status: 500 },
    );
  }
}
