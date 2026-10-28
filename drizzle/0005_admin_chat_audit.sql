CREATE TABLE `admin_chat_audit` (`id` text PRIMARY KEY NOT NULL, `admin` text NOT NULL, `participant_a` text NOT NULL, `participant_b` text NOT NULL, `viewed_at` integer NOT NULL, `message_count` integer NOT NULL);
CREATE INDEX `admin_chat_audit_admin_time` ON `admin_chat_audit` (`admin`, `viewed_at`);
