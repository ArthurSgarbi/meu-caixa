CREATE TABLE `credit_card_invoices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`card_id` integer NOT NULL,
	`owner_id` text NOT NULL,
	`reference_month` text NOT NULL,
	`closing_date` text NOT NULL,
	`due_date` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`paid_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `credit_cards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_card_invoices_card_month` ON `credit_card_invoices` (`card_id`,`reference_month`);--> statement-breakpoint
CREATE INDEX `idx_card_invoices_owner_month` ON `credit_card_invoices` (`owner_id`,`reference_month`);--> statement-breakpoint
CREATE TABLE `credit_card_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`card_id` integer NOT NULL,
	`invoice_id` integer NOT NULL,
	`owner_id` text NOT NULL,
	`purchase_group_id` text NOT NULL,
	`description` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`purchase_date` text NOT NULL,
	`installment_number` integer DEFAULT 1 NOT NULL,
	`installment_count` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `credit_cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invoice_id`) REFERENCES `credit_card_invoices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_card_transactions_owner_card` ON `credit_card_transactions` (`owner_id`,`card_id`);--> statement-breakpoint
CREATE INDEX `idx_card_transactions_invoice` ON `credit_card_transactions` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `idx_card_transactions_purchase_group` ON `credit_card_transactions` (`purchase_group_id`);--> statement-breakpoint
CREATE TABLE `credit_cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`brand` text NOT NULL,
	`last_four` text NOT NULL,
	`credit_limit_cents` integer NOT NULL,
	`closing_day` integer NOT NULL,
	`due_day` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_credit_cards_owner` ON `credit_cards` (`owner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_credit_cards_owner_name` ON `credit_cards` (`owner_id`,`name`);