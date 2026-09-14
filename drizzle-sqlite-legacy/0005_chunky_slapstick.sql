CREATE TABLE `saved_simulations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`simulation_type` text NOT NULL,
	`input_json` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_saved_simulations_owner_name` ON `saved_simulations` (`owner_id`,`name`);--> statement-breakpoint
CREATE INDEX `idx_saved_simulations_owner_updated` ON `saved_simulations` (`owner_id`,`updated_at`);