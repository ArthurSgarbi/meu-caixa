CREATE TABLE `investment_contributions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`wallet_id` integer NOT NULL,
	`owner_id` text NOT NULL,
	`description` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`contribution_date` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`wallet_id`) REFERENCES `investment_wallets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_investment_contributions_owner_date` ON `investment_contributions` (`owner_id`,`contribution_date`);--> statement-breakpoint
CREATE INDEX `idx_investment_contributions_wallet` ON `investment_contributions` (`wallet_id`);--> statement-breakpoint
CREATE TABLE `investment_wallets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_id` text NOT NULL,
	`balance_cents` integer DEFAULT 0 NOT NULL,
	`annual_cdi_rate_bps` integer DEFAULT 1050 NOT NULL,
	`cdb_percentage_bps` integer DEFAULT 10000 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_investment_wallets_owner` ON `investment_wallets` (`owner_id`);