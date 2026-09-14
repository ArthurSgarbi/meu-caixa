CREATE TABLE "budgets" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"month" text NOT NULL,
	"limit_cents" integer NOT NULL,
	"owner_id" text DEFAULT '' NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"type" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_card_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_id" integer NOT NULL,
	"owner_id" text NOT NULL,
	"reference_month" text NOT NULL,
	"closing_date" text NOT NULL,
	"due_date" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"paid_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_card_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_id" integer NOT NULL,
	"invoice_id" integer NOT NULL,
	"owner_id" text NOT NULL,
	"purchase_group_id" text NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"purchase_date" text NOT NULL,
	"installment_number" integer DEFAULT 1 NOT NULL,
	"installment_count" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"brand" text NOT NULL,
	"last_four" text NOT NULL,
	"credit_limit_cents" integer NOT NULL,
	"closing_day" integer NOT NULL,
	"due_day" integer NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investment_contributions" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_id" integer NOT NULL,
	"owner_id" text NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"contribution_date" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investment_wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"balance_cents" integer DEFAULT 0 NOT NULL,
	"annual_cdi_rate_bps" integer DEFAULT 1050 NOT NULL,
	"cdb_percentage_bps" integer DEFAULT 10000 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"asset_class" text NOT NULL,
	"invested_cents" integer NOT NULL,
	"current_value_cents" integer NOT NULL,
	"acquisition_date" text NOT NULL,
	"owner_id" text DEFAULT '' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_simulations" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"simulation_type" text NOT NULL,
	"input_json" text NOT NULL,
	"result_json" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"type" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"transaction_date" text NOT NULL,
	"category_id" integer NOT NULL,
	"owner_id" text DEFAULT '' NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_card_invoices" ADD CONSTRAINT "credit_card_invoices_card_id_credit_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."credit_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_card_transactions" ADD CONSTRAINT "credit_card_transactions_card_id_credit_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."credit_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_card_transactions" ADD CONSTRAINT "credit_card_transactions_invoice_id_credit_card_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."credit_card_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_contributions" ADD CONSTRAINT "investment_contributions_wallet_id_investment_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."investment_wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_budgets_owner_category_month" ON "budgets" USING btree ("owner_id","category_id","month");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_categories_slug" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_categories_type" ON "categories" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_card_invoices_card_month" ON "credit_card_invoices" USING btree ("card_id","reference_month");--> statement-breakpoint
CREATE INDEX "idx_card_invoices_owner_month" ON "credit_card_invoices" USING btree ("owner_id","reference_month");--> statement-breakpoint
CREATE INDEX "idx_card_transactions_owner_card" ON "credit_card_transactions" USING btree ("owner_id","card_id");--> statement-breakpoint
CREATE INDEX "idx_card_transactions_invoice" ON "credit_card_transactions" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_card_transactions_purchase_group" ON "credit_card_transactions" USING btree ("purchase_group_id");--> statement-breakpoint
CREATE INDEX "idx_credit_cards_owner" ON "credit_cards" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_credit_cards_owner_name" ON "credit_cards" USING btree ("owner_id","name");--> statement-breakpoint
CREATE INDEX "idx_investment_contributions_owner_date" ON "investment_contributions" USING btree ("owner_id","contribution_date");--> statement-breakpoint
CREATE INDEX "idx_investment_contributions_wallet" ON "investment_contributions" USING btree ("wallet_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_investment_wallets_owner" ON "investment_wallets" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_investments_owner_asset_class" ON "investments" USING btree ("owner_id","asset_class");--> statement-breakpoint
CREATE INDEX "idx_investments_asset_class" ON "investments" USING btree ("asset_class");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_saved_simulations_owner_name" ON "saved_simulations" USING btree ("owner_id","name");--> statement-breakpoint
CREATE INDEX "idx_saved_simulations_owner_updated" ON "saved_simulations" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_transactions_owner_date" ON "transactions" USING btree ("owner_id","transaction_date");--> statement-breakpoint
CREATE INDEX "idx_transactions_date" ON "transactions" USING btree ("transaction_date");--> statement-breakpoint
CREATE INDEX "idx_transactions_category_date" ON "transactions" USING btree ("category_id","transaction_date");