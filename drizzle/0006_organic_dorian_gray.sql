CREATE TABLE "bank_connection_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"scope_hash" text NOT NULL,
	"payload" text NOT NULL,
	"fetched_at" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_bank_snapshot_owner" ON "bank_connection_snapshots" USING btree ("owner_id");