CREATE INDEX `messages_sender_recipient_created` ON `messages` (`sender`,`recipient`,`created`);--> statement-breakpoint
CREATE INDEX `ticket_messages_ticket_created` ON `ticket_messages` (`ticket`,`created`);--> statement-breakpoint
CREATE INDEX `uploads_owner_scope` ON `uploads` (`owner`,`scope`);