CREATE TABLE "user_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"preferences_json" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_user_preferences_owner" ON "user_preferences" USING btree ("owner_id");