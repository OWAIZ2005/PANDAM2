CREATE TABLE `need_images` (
	`id` text PRIMARY KEY NOT NULL,
	`need_id` text NOT NULL,
	`object_key` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`need_id`) REFERENCES `needs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `need_images_need_idx` ON `need_images` (`need_id`,`sort_order`);