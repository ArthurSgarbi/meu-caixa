DROP INDEX `idx_budgets_category_month`;--> statement-breakpoint
ALTER TABLE `budgets` ADD `owner_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_budgets_owner_category_month` ON `budgets` (`owner_id`,`category_id`,`month`);--> statement-breakpoint
ALTER TABLE `investments` ADD `owner_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_investments_owner_asset_class` ON `investments` (`owner_id`,`asset_class`);--> statement-breakpoint
ALTER TABLE `transactions` ADD `owner_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_transactions_owner_date` ON `transactions` (`owner_id`,`transaction_date`);