CREATE TABLE `export_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`admin` text NOT NULL,
	`count` integer NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `privacy_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`version` text NOT NULL,
	`research_opt_in` integer NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `privacy_events_user` ON `privacy_events` (`user_id`);--> statement-breakpoint
CREATE TABLE `privacy_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`notice_version` text NOT NULL,
	`accepted_at` integer NOT NULL,
	`research_opt_in` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	`export_id` text NOT NULL
);
