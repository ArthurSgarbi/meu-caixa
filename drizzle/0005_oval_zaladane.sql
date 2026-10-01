CREATE TABLE "account_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"from_account_id" integer,
	"to_account_id" integer,
	"amount_cents" integer NOT NULL,
	"transfer_date" text NOT NULL,
	"description" text NOT NULL,
	"request_id" text NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "transfers_distinct_accounts" CHECK ("account_transfers"."from_account_id" IS DISTINCT FROM "account_transfers"."to_account_id"),
	CONSTRAINT "account_transfers_positive" CHECK ("account_transfers"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "financial_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"institution" text NOT NULL,
	"opening_balance_cents" integer DEFAULT 0 NOT NULL,
	"opened_on" text NOT NULL,
	"request_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "accounts_opening_nonnegative" CHECK ("financial_accounts"."opening_balance_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "financial_goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"target_cents" integer NOT NULL,
	"target_date" text NOT NULL,
	"request_id" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "goals_target_positive" CHECK ("financial_goals"."target_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "goal_allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"goal_id" integer NOT NULL,
	"account_id" integer,
	"amount_cents" integer NOT NULL,
	"request_id" text NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "goal_allocations_nonzero" CHECK ("goal_allocations"."amount_cents" <> 0)
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "account_id" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_accounts_owner_id" ON "financial_accounts" USING btree ("owner_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_goals_owner_id" ON "financial_goals" USING btree ("owner_id","id");--> statement-breakpoint
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_owner_id_from_account_id_financial_accounts_owner_id_id_fk" FOREIGN KEY ("owner_id","from_account_id") REFERENCES "public"."financial_accounts"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_owner_id_to_account_id_financial_accounts_owner_id_id_fk" FOREIGN KEY ("owner_id","to_account_id") REFERENCES "public"."financial_accounts"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_allocations" ADD CONSTRAINT "goal_allocations_owner_id_goal_id_financial_goals_owner_id_id_fk" FOREIGN KEY ("owner_id","goal_id") REFERENCES "public"."financial_goals"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_allocations" ADD CONSTRAINT "goal_allocations_owner_id_account_id_financial_accounts_owner_id_id_fk" FOREIGN KEY ("owner_id","account_id") REFERENCES "public"."financial_accounts"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_account_transfers_request" ON "account_transfers" USING btree ("owner_id","request_id");--> statement-breakpoint
CREATE INDEX "idx_account_transfers_owner_date" ON "account_transfers" USING btree ("owner_id","transfer_date");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_accounts_request" ON "financial_accounts" USING btree ("owner_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_goals_request" ON "financial_goals" USING btree ("owner_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_goal_allocations_request" ON "goal_allocations" USING btree ("owner_id","request_id");--> statement-breakpoint
CREATE INDEX "idx_goal_allocations_owner_goal" ON "goal_allocations" USING btree ("owner_id","goal_id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_owner_id_account_id_financial_accounts_owner_id_id_fk" FOREIGN KEY ("owner_id","account_id") REFERENCES "public"."financial_accounts"("owner_id","id") ON DELETE no action ON UPDATE no action;
