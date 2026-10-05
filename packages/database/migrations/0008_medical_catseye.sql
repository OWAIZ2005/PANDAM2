CREATE TABLE `item_views` (
	`id` text PRIMARY KEY NOT NULL,
	`item_kind` text NOT NULL,
	`item_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `item_views_item_idx` ON `item_views` (`item_kind`,`item_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `item_views_unique` ON `item_views` (`item_kind`,`item_id`,`user_id`);