CREATE TABLE "recurring_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"description" text NOT NULL,
	"type" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"category_id" integer NOT NULL,
	"starts_on" text NOT NULL,
	"ends_on" text,
	"active" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "recurring_rule_id" integer;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "recurring_occurrence_date" text;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_recurring_rules_owner" ON "recurring_rules" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurring_rule_id_recurring_rules_id_fk" FOREIGN KEY ("recurring_rule_id") REFERENCES "public"."recurring_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_transactions_recurring_occurrence" ON "transactions" USING btree ("owner_id","recurring_rule_id","recurring_occurrence_date");