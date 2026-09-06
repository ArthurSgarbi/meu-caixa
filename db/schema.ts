import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const categories = sqliteTable(
  'categories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    type: text('type', { enum: ['income', 'expense'] }).notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_categories_slug').on(table.slug),
    index('idx_categories_type').on(table.type),
  ],
);

export const transactions = sqliteTable(
  'transactions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    description: text('description').notNull(),
    type: text('type', { enum: ['income', 'expense'] }).notNull(),
    amountCents: integer('amount_cents').notNull(),
    transactionDate: text('transaction_date').notNull(),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_transactions_date').on(table.transactionDate),
    index('idx_transactions_category_date').on(
      table.categoryId,
      table.transactionDate,
    ),
  ],
);

export const budgets = sqliteTable(
  'budgets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id),
    month: text('month').notNull(),
    limitCents: integer('limit_cents').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_budgets_category_month').on(table.categoryId, table.month),
  ],
);
