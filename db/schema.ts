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
    ownerId: text('owner_id').notNull().default(''),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_transactions_owner_date').on(
      table.ownerId,
      table.transactionDate,
    ),
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
    ownerId: text('owner_id').notNull().default(''),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_budgets_owner_category_month').on(
      table.ownerId,
      table.categoryId,
      table.month,
    ),
  ],
);

export const investments = sqliteTable(
  'investments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    assetClass: text('asset_class', {
      enum: [
        'Renda fixa',
        'Ações',
        'Fundos imobiliários',
        'Criptoativos',
        'Outros',
      ],
    }).notNull(),
    investedCents: integer('invested_cents').notNull(),
    currentValueCents: integer('current_value_cents').notNull(),
    acquisitionDate: text('acquisition_date').notNull(),
    ownerId: text('owner_id').notNull().default(''),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_investments_owner_asset_class').on(
      table.ownerId,
      table.assetClass,
    ),
    index('idx_investments_asset_class').on(table.assetClass),
  ],
);

export const investmentWallets = sqliteTable(
  'investment_wallets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ownerId: text('owner_id').notNull(),
    balanceCents: integer('balance_cents').notNull().default(0),
    annualCdiRateBps: integer('annual_cdi_rate_bps').notNull().default(1050),
    cdbPercentageBps: integer('cdb_percentage_bps').notNull().default(10000),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('idx_investment_wallets_owner').on(table.ownerId)],
);

export const investmentContributions = sqliteTable(
  'investment_contributions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    walletId: integer('wallet_id')
      .notNull()
      .references(() => investmentWallets.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    description: text('description').notNull(),
    amountCents: integer('amount_cents').notNull(),
    contributionDate: text('contribution_date').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_investment_contributions_owner_date').on(
      table.ownerId,
      table.contributionDate,
    ),
    index('idx_investment_contributions_wallet').on(table.walletId),
  ],
);

export const savedSimulations = sqliteTable(
  'saved_simulations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ownerId: text('owner_id').notNull(),
    name: text('name').notNull(),
    simulationType: text('simulation_type', {
      enum: ['debt', 'investment'],
    }).notNull(),
    inputJson: text('input_json').notNull(),
    resultJson: text('result_json').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_saved_simulations_owner_name').on(
      table.ownerId,
      table.name,
    ),
    index('idx_saved_simulations_owner_updated').on(
      table.ownerId,
      table.updatedAt,
    ),
  ],
);

export const creditCards = sqliteTable(
  'credit_cards',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ownerId: text('owner_id').notNull(),
    name: text('name').notNull(),
    brand: text('brand').notNull(),
    lastFour: text('last_four').notNull(),
    creditLimitCents: integer('credit_limit_cents').notNull(),
    closingDay: integer('closing_day').notNull(),
    dueDay: integer('due_day').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_credit_cards_owner').on(table.ownerId),
    uniqueIndex('idx_credit_cards_owner_name').on(table.ownerId, table.name),
  ],
);

export const creditCardInvoices = sqliteTable(
  'credit_card_invoices',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    cardId: integer('card_id')
      .notNull()
      .references(() => creditCards.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    referenceMonth: text('reference_month').notNull(),
    closingDate: text('closing_date').notNull(),
    dueDate: text('due_date').notNull(),
    status: text('status', { enum: ['open', 'closed', 'paid'] })
      .notNull()
      .default('open'),
    paidAt: text('paid_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_card_invoices_card_month').on(
      table.cardId,
      table.referenceMonth,
    ),
    index('idx_card_invoices_owner_month').on(
      table.ownerId,
      table.referenceMonth,
    ),
  ],
);

export const creditCardTransactions = sqliteTable(
  'credit_card_transactions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    cardId: integer('card_id')
      .notNull()
      .references(() => creditCards.id, { onDelete: 'cascade' }),
    invoiceId: integer('invoice_id')
      .notNull()
      .references(() => creditCardInvoices.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    purchaseGroupId: text('purchase_group_id').notNull(),
    description: text('description').notNull(),
    amountCents: integer('amount_cents').notNull(),
    purchaseDate: text('purchase_date').notNull(),
    installmentNumber: integer('installment_number').notNull().default(1),
    installmentCount: integer('installment_count').notNull().default(1),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_card_transactions_owner_card').on(table.ownerId, table.cardId),
    index('idx_card_transactions_invoice').on(table.invoiceId),
    index('idx_card_transactions_purchase_group').on(table.purchaseGroupId),
  ],
);
