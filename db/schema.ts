import {
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  uniqueIndex,
  check,
  foreignKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const financialAccounts = pgTable(
  'financial_accounts',
  {
    id: serial('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    name: text('name').notNull(),
    institution: text('institution').notNull(),
    openingBalanceCents: integer('opening_balance_cents').notNull().default(0),
    openedOn: text('opened_on').notNull(),
    requestId: text('request_id').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('idx_accounts_owner_id').on(t.ownerId, t.id),
    uniqueIndex('idx_accounts_request').on(t.ownerId, t.requestId),
    check('accounts_opening_nonnegative', sql`${t.openingBalanceCents} >= 0`),
  ],
);

export const financialGoals = pgTable(
  'financial_goals',
  {
    id: serial('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    name: text('name').notNull(),
    targetCents: integer('target_cents').notNull(),
    targetDate: text('target_date').notNull(),
    requestId: text('request_id').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('idx_goals_owner_id').on(t.ownerId, t.id),
    uniqueIndex('idx_goals_request').on(t.ownerId, t.requestId),
    check('goals_target_positive', sql`${t.targetCents} > 0`),
  ],
);

export const accountTransfers = pgTable(
  'account_transfers',
  {
    id: serial('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    fromAccountId: integer('from_account_id'),
    toAccountId: integer('to_account_id'),
    amountCents: integer('amount_cents').notNull(),
    transferDate: text('transfer_date').notNull(),
    description: text('description').notNull(),
    requestId: text('request_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('idx_account_transfers_request').on(t.ownerId, t.requestId),
    index('idx_account_transfers_owner_date').on(t.ownerId, t.transferDate),
    foreignKey({
      columns: [t.ownerId, t.fromAccountId],
      foreignColumns: [financialAccounts.ownerId, financialAccounts.id],
    }),
    foreignKey({
      columns: [t.ownerId, t.toAccountId],
      foreignColumns: [financialAccounts.ownerId, financialAccounts.id],
    }),
    check(
      'transfers_distinct_accounts',
      sql`${t.fromAccountId} IS DISTINCT FROM ${t.toAccountId}`,
    ),
    check('account_transfers_positive', sql`${t.amountCents} > 0`),
  ],
);

export const goalAllocations = pgTable(
  'goal_allocations',
  {
    id: serial('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    goalId: integer('goal_id').notNull(),
    accountId: integer('account_id'),
    amountCents: integer('amount_cents').notNull(),
    requestId: text('request_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('idx_goal_allocations_request').on(t.ownerId, t.requestId),
    index('idx_goal_allocations_owner_goal').on(t.ownerId, t.goalId),
    foreignKey({
      columns: [t.ownerId, t.goalId],
      foreignColumns: [financialGoals.ownerId, financialGoals.id],
    }),
    foreignKey({
      columns: [t.ownerId, t.accountId],
      foreignColumns: [financialAccounts.ownerId, financialAccounts.id],
    }),
    check('goal_allocations_nonzero', sql`${t.amountCents} <> 0`),
  ],
);

export const categories = pgTable(
  'categories',
  {
    id: serial('id').primaryKey(),
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

export const userPreferences = pgTable(
  'user_preferences',
  {
    id: serial('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    preferencesJson: text('preferences_json').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('idx_user_preferences_owner').on(table.ownerId)],
);

export const transactions = pgTable(
  'transactions',
  {
    id: serial('id').primaryKey(),
    description: text('description').notNull(),
    type: text('type', { enum: ['income', 'expense', 'transfer'] }).notNull(),
    amountCents: integer('amount_cents').notNull(),
    transactionDate: text('transaction_date').notNull(),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id),
    ownerId: text('owner_id').notNull().default(''),
    accountId: integer('account_id'),
    recurringRuleId: integer('recurring_rule_id').references(
      () => recurringRules.id,
      {
        onDelete: 'set null',
      },
    ),
    recurringOccurrenceDate: text('recurring_occurrence_date'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.ownerId, table.accountId],
      foreignColumns: [financialAccounts.ownerId, financialAccounts.id],
    }),
    index('idx_transactions_owner_date').on(
      table.ownerId,
      table.transactionDate,
    ),
    index('idx_transactions_date').on(table.transactionDate),
    index('idx_transactions_category_date').on(
      table.categoryId,
      table.transactionDate,
    ),
    uniqueIndex('idx_transactions_recurring_occurrence').on(
      table.ownerId,
      table.recurringRuleId,
      table.recurringOccurrenceDate,
    ),
  ],
);

export const recurringRules = pgTable(
  'recurring_rules',
  {
    id: serial('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    description: text('description').notNull(),
    type: text('type', { enum: ['income', 'expense'] }).notNull(),
    amountCents: integer('amount_cents').notNull(),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id),
    startsOn: text('starts_on').notNull(),
    endsOn: text('ends_on'),
    active: integer('active').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_recurring_rules_owner').on(table.ownerId)],
);

export const budgets = pgTable(
  'budgets',
  {
    id: serial('id').primaryKey(),
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

export const investments = pgTable(
  'investments',
  {
    id: serial('id').primaryKey(),
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
    ticker: text('ticker'),
    quantity: numeric('quantity', { precision: 20, scale: 8 }),
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

export const investmentWallets = pgTable(
  'investment_wallets',
  {
    id: serial('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    balanceCents: integer('balance_cents').notNull().default(0),
    annualCdiRateBps: integer('annual_cdi_rate_bps').notNull().default(1050),
    cdbPercentageBps: integer('cdb_percentage_bps').notNull().default(10000),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('idx_investment_wallets_owner').on(table.ownerId)],
);

export const investmentContributions = pgTable(
  'investment_contributions',
  {
    id: serial('id').primaryKey(),
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

export const savedSimulations = pgTable(
  'saved_simulations',
  {
    id: serial('id').primaryKey(),
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

export const creditCards = pgTable(
  'credit_cards',
  {
    id: serial('id').primaryKey(),
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

export const creditCardInvoices = pgTable(
  'credit_card_invoices',
  {
    id: serial('id').primaryKey(),
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

export const creditCardTransactions = pgTable(
  'credit_card_transactions',
  {
    id: serial('id').primaryKey(),
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
