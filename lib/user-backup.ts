import { createHash } from 'node:crypto';
function isValidBackupDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

const nullableColumns = new Set([
  'ends_on',
  'recurring_rule_id',
  'recurring_occurrence_date',
  'ticker',
  'quantity',
  'paid_at',
  'account_id',
  'from_account_id',
  'to_account_id',
]);
const dateColumns = new Set([
  'starts_on',
  'ends_on',
  'transaction_date',
  'recurring_occurrence_date',
  'contribution_date',
  'acquisition_date',
  'closing_date',
  'due_date',
  'purchase_date',
  'opened_on',
  'target_date',
  'transfer_date',
]);
const integerColumns = new Set([
  'id',
  'category_id',
  'recurring_rule_id',
  'amount_cents',
  'active',
  'limit_cents',
  'balance_cents',
  'annual_cdi_rate_bps',
  'cdb_percentage_bps',
  'wallet_id',
  'invested_cents',
  'current_value_cents',
  'credit_limit_cents',
  'closing_day',
  'due_day',
  'card_id',
  'invoice_id',
  'installment_number',
  'installment_count',
  'account_id',
  'from_account_id',
  'to_account_id',
  'goal_id',
  'opening_balance_cents',
  'target_cents',
]);

export const backupTables = [
  {
    name: 'financial_accounts',
    columns: [
      'id',
      'owner_id',
      'name',
      'institution',
      'opening_balance_cents',
      'opened_on',
      'request_id',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'financial_goals',
    columns: [
      'id',
      'owner_id',
      'name',
      'target_cents',
      'target_date',
      'request_id',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'recurring_rules',
    columns: [
      'id',
      'owner_id',
      'description',
      'type',
      'amount_cents',
      'category_id',
      'starts_on',
      'ends_on',
      'active',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'transactions',
    columns: [
      'id',
      'owner_id',
      'description',
      'type',
      'amount_cents',
      'transaction_date',
      'account_id',
      'category_id',
      'recurring_rule_id',
      'recurring_occurrence_date',
      'created_at',
    ],
  },
  {
    name: 'budgets',
    columns: [
      'id',
      'owner_id',
      'category_id',
      'month',
      'limit_cents',
      'created_at',
    ],
  },
  {
    name: 'investment_wallets',
    columns: [
      'id',
      'owner_id',
      'balance_cents',
      'annual_cdi_rate_bps',
      'cdb_percentage_bps',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'investment_contributions',
    columns: [
      'id',
      'owner_id',
      'wallet_id',
      'description',
      'amount_cents',
      'contribution_date',
      'created_at',
    ],
  },
  {
    name: 'investments',
    columns: [
      'id',
      'owner_id',
      'name',
      'asset_class',
      'invested_cents',
      'current_value_cents',
      'ticker',
      'quantity',
      'acquisition_date',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'saved_simulations',
    columns: [
      'id',
      'owner_id',
      'name',
      'simulation_type',
      'input_json',
      'result_json',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'credit_cards',
    columns: [
      'id',
      'owner_id',
      'name',
      'brand',
      'last_four',
      'credit_limit_cents',
      'closing_day',
      'due_day',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'credit_card_invoices',
    columns: [
      'id',
      'owner_id',
      'card_id',
      'reference_month',
      'closing_date',
      'due_date',
      'status',
      'paid_at',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'credit_card_transactions',
    columns: [
      'id',
      'owner_id',
      'card_id',
      'invoice_id',
      'purchase_group_id',
      'description',
      'amount_cents',
      'purchase_date',
      'installment_number',
      'installment_count',
      'created_at',
    ],
  },
  {
    name: 'account_transfers',
    columns: [
      'id',
      'owner_id',
      'from_account_id',
      'to_account_id',
      'amount_cents',
      'transfer_date',
      'description',
      'request_id',
      'created_at',
    ],
  },
  {
    name: 'goal_allocations',
    columns: [
      'id',
      'owner_id',
      'goal_id',
      'account_id',
      'amount_cents',
      'request_id',
      'created_at',
    ],
  },
] as const;

export type BackupTableName = (typeof backupTables)[number]['name'];
export type BackupRows = Record<BackupTableName, Record<string, unknown>[]>;
export type UserBackup = {
  format: 'meu-caixa-backup';
  version: 1;
  ownerId: string;
  exportedAt: string;
  categories: { id: number; slug: string; type: string }[];
  data: BackupRows;
  sha256: string;
};

export function backupDigest(
  payload: Pick<UserBackup, 'ownerId' | 'categories' | 'data'>,
) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        ownerId: payload.ownerId,
        categories: payload.categories,
        data: payload.data,
      }),
    )
    .digest('hex');
}

export function validateBackup(value: unknown, ownerId: string): UserBackup {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Arquivo de backup inválido.');
  const backup = value as Partial<UserBackup>;
  if (backup.format !== 'meu-caixa-backup' || backup.version !== 1)
    throw new Error('Versão de backup não suportada.');
  if (backup.ownerId !== ownerId)
    throw new Error('Este backup pertence a outra conta.');
  if (
    !Array.isArray(backup.categories) ||
    !backup.data ||
    typeof backup.data !== 'object'
  )
    throw new Error('Dados do backup incompletos.');
  // Verificar o checksum ANTES de acrescentar campos opcionais de arquivos antigos.
  if (
    typeof backup.sha256 !== 'string' ||
    backup.sha256 !== backupDigest(backup as UserBackup)
  )
    throw new Error('O arquivo não passou na verificação de integridade.');
  const extensionTables = [
    'financial_accounts',
    'financial_goals',
    'account_transfers',
    'goal_allocations',
  ] as const;
  const legacy = extensionTables.every((name) => !(name in backup.data!));
  if (legacy) {
    for (const name of extensionTables) backup.data[name] = [];
    if (Array.isArray(backup.data.transactions))
      backup.data.transactions = backup.data.transactions.map((row) => ({
        ...row,
        account_id: row.account_id ?? null,
      }));
  }
  if (
    backup.categories.length > 100 ||
    backup.categories.some(
      (item) =>
        !item ||
        !Number.isSafeInteger(item.id) ||
        item.id <= 0 ||
        typeof item.slug !== 'string' ||
        typeof item.type !== 'string',
    )
  )
    throw new Error('Categorias do backup inválidas.');
  if (
    new Set(backup.categories.map((item) => item.id)).size !==
    backup.categories.length
  )
    throw new Error('Categorias duplicadas no backup.');
  let total = 0;
  for (const table of backupTables) {
    const rows = backup.data[table.name];
    if (!Array.isArray(rows))
      throw new Error(`Tabela ${table.name} ausente no backup.`);
    total += rows.length;
    if (total > 2000)
      throw new Error(
        'Backup excede 2.000 registros. É necessária recuperação assistida.',
      );
    const ids = new Set<number>();
    for (const row of rows) {
      if (
        !row ||
        typeof row !== 'object' ||
        Array.isArray(row) ||
        !Number.isSafeInteger(row.id) ||
        Number(row.id) <= 0 ||
        row.owner_id !== ownerId
      )
        throw new Error(`Registro inválido em ${table.name}.`);
      if (ids.has(Number(row.id)))
        throw new Error(`ID duplicado em ${table.name}.`);
      ids.add(Number(row.id));
      for (const column of table.columns) {
        const field = row[column];
        if (
          field === undefined ||
          (field === null && !nullableColumns.has(column)) ||
          (field !== null &&
            typeof field !== 'string' &&
            (typeof field !== 'number' || !Number.isSafeInteger(field)))
        )
          throw new Error(`Campo inválido em ${table.name}.${column}.`);
        if (
          field !== null &&
          dateColumns.has(column) &&
          (typeof field !== 'string' || !isValidBackupDate(field))
        )
          throw new Error(`Data inválida em ${table.name}.${column}.`);
        if (
          field !== null &&
          integerColumns.has(column) &&
          (typeof field !== 'number' ||
            !Number.isSafeInteger(field) ||
            Math.abs(field) > 2_147_483_647)
        )
          throw new Error(`Número inválido em ${table.name}.${column}.`);
        if (
          (column === 'month' || column === 'reference_month') &&
          (typeof field !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(field))
        )
          throw new Error(`Mês inválido em ${table.name}.${column}.`);
      }
    }
  }
  // Uma liberação não pode criar reserva negativa, mesmo com checksum recalculado.
  const reservations = new Map<string, number>();
  const goalTotals = new Map<number, number>();
  for (const row of backup.data.goal_allocations) {
    const goalId = Number(row.goal_id);
    const key = `${goalId}:${row.account_id === null ? 'main' : Number(row.account_id)}`;
    reservations.set(
      key,
      (reservations.get(key) ?? 0) + Number(row.amount_cents),
    );
    goalTotals.set(
      goalId,
      (goalTotals.get(goalId) ?? 0) + Number(row.amount_cents),
    );
  }
  if (
    [...reservations.values()].some((amount) => amount < 0) ||
    backup.data.financial_goals.some(
      (row) =>
        Number(row.target_cents) <= 0 ||
        (goalTotals.get(Number(row.id)) ?? 0) > Number(row.target_cents),
    )
  )
    throw new Error('Reservas ou objetivos inválidos no backup.');
  // A cópia normalizada é válida também quando usada novamente na restauração.
  backup.sha256 = backupDigest(backup as UserBackup);
  return backup as UserBackup;
}

export function csvCell(value: string) {
  const safe = /^[\s\t\r]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
