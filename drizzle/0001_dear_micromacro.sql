CREATE TABLE `investments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`asset_class` text NOT NULL,
	`invested_cents` integer NOT NULL,
	`current_value_cents` integer NOT NULL,
	`acquisition_date` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_investments_asset_class` ON `investments` (`asset_class`);