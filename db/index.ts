import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

export type DbRow = Record<string, unknown>;

export type DbRunResult = {
  meta: {
    changes: number;
    last_row_id: number | null;
  };
};

export type PreparedStatement = {
  bind: (...values: unknown[]) => PreparedStatement;
  all: <T extends DbRow = DbRow>() => Promise<{ results: T[] }>;
  first: <T extends DbRow = DbRow>() => Promise<T | null>;
  run: () => Promise<DbRunResult>;
};

export type Database = {
  prepare: (query: string) => PreparedStatement;
  batch: (statements: PreparedStatement[]) => Promise<DbRunResult[]>;
};

type BoundStatement = PreparedStatement & {
  readonly sqlText: string;
  readonly values: unknown[];
};

let database: Database | null = null;

function normalizeSql(query: string) {
  let parameterIndex = 0;
  let normalized = query
    .replace(/\?/g, () => `$${++parameterIndex}`)
    .replace(/\bAS\s+([a-z]+[A-Z][A-Za-z0-9_]*)/g, 'AS "$1"');

  const ignoresConflict = /\bINSERT\s+OR\s+IGNORE\s+INTO\b/i.test(normalized);
  normalized = normalized.replace(
    /\bINSERT\s+OR\s+IGNORE\s+INTO\b/i,
    'INSERT INTO',
  );
  if (ignoresConflict && !/\bON\s+CONFLICT\b/i.test(normalized)) {
    normalized = `${normalized.trim().replace(/;$/, '')} ON CONFLICT DO NOTHING`;
  }

  return normalized;
}

function createStatement(
  sql: NeonQueryFunction<false, false>,
  query: string,
  params: unknown[] = [],
): BoundStatement {
  const normalized = normalizeSql(query);
  return {
    sqlText: normalized,
    values: params,
    bind: (...values: unknown[]) => createStatement(sql, query, values),
    all: async <T extends DbRow>() => {
      const rows = (await sql.query(normalized, params)) as T[];
      return { results: rows };
    },
    first: async <T extends DbRow>() => {
      const rows = (await sql.query(normalized, params)) as T[];
      return (rows[0] as T | undefined) ?? null;
    },
    run: async () => {
      const isInsert = /^\s*INSERT\b/i.test(normalized);
      const runnable =
        isInsert && !/\bRETURNING\b/i.test(normalized)
          ? `${normalized.trim().replace(/;$/, '')} RETURNING id`
          : normalized;
      const result = await sql.query(runnable, params, { fullResults: true });
      const firstRow = result.rows[0] as { id?: unknown } | undefined;
      return {
        meta: {
          changes: result.rowCount ?? 0,
          last_row_id:
            typeof firstRow?.id === 'number'
              ? firstRow.id
              : Number(firstRow?.id) || null,
        },
      };
    },
  };
}

export function getDb(): Database {
  if (database) return database;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL não está configurada. Vincule um banco Neon ao projeto na Vercel.',
    );
  }

  const sql = neon(connectionString);
  database = {
    prepare: (query) => createStatement(sql, query),
    batch: async (statements) => {
      const bound = statements as BoundStatement[];
      const results = await sql.transaction(
        (transaction) =>
          bound.map((statement) =>
            transaction.query(statement.sqlText, statement.values),
          ),
        { fullResults: true },
      );
      return results.map((result) => ({
        meta: {
          changes: result.rowCount ?? 0,
          last_row_id: null,
        },
      }));
    },
  };
  return database;
}
