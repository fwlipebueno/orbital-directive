CREATE TABLE `users` (
  `id` varchar(36) NOT NULL,
  `email` varchar(180) NOT NULL,
  `name` varchar(60) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `is_demo` boolean NOT NULL DEFAULT false,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT `users_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `users_email_unique` UNIQUE (`email`)
);
--> statement-breakpoint

CREATE TABLE `sessions` (
  `id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `token_hash` varchar(64) NOT NULL,
  `ip_address` varchar(64),
  `user_agent` varchar(255),
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expires_at` datetime(3) NOT NULL,
  `last_used_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `revoked_at` datetime(3),
  CONSTRAINT `sessions_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `sessions_token_hash_unique` UNIQUE (`token_hash`),
  CONSTRAINT `sessions_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);
--> statement-breakpoint

CREATE TABLE `user_preferences` (
  `user_id` varchar(36) NOT NULL,
  `reduced_sensory_mode` boolean NOT NULL DEFAULT false,
  `compact_density` boolean NOT NULL DEFAULT false,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT `user_preferences_user_id_pk` PRIMARY KEY (`user_id`),
  CONSTRAINT `user_preferences_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint

CREATE TABLE `stations` (
  `id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `name` varchar(120) NOT NULL,
  `version` int unsigned NOT NULL DEFAULT 1,
  `last_processed_at` datetime(3) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT `stations_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `stations_user_id_unique` UNIQUE (`user_id`),
  CONSTRAINT `stations_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint

CREATE TABLE `station_resources` (
  `station_id` varchar(36) NOT NULL,
  `energy` decimal(12,3) NOT NULL,
  `oxygen` decimal(12,3) NOT NULL,
  `water` decimal(12,3) NOT NULL,
  `food` decimal(12,3) NOT NULL,
  `credits` decimal(14,3) NOT NULL,
  `research` decimal(14,3) NOT NULL,
  `hull_integrity` decimal(12,3) NOT NULL,
  `morale` decimal(12,3) NOT NULL,
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT `station_resources_station_id_pk` PRIMARY KEY (`station_id`),
  CONSTRAINT `station_resources_station_id_fk` FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint

CREATE TABLE `station_modules` (
  `id` varchar(36) NOT NULL,
  `station_id` varchar(36) NOT NULL,
  `module_type` varchar(32) NOT NULL,
  `level` int unsigned NOT NULL DEFAULT 1,
  `health` decimal(5,2) NOT NULL DEFAULT 100,
  `is_online` boolean NOT NULL DEFAULT true,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT `station_modules_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `station_modules_station_type_unique` UNIQUE (`station_id`, `module_type`),
  CONSTRAINT `station_modules_station_id_fk` FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `station_modules_station_id_idx` ON `station_modules` (`station_id`);
--> statement-breakpoint

CREATE TABLE `station_incidents` (
  `id` varchar(36) NOT NULL,
  `station_id` varchar(36) NOT NULL,
  `incident_type` varchar(48) NOT NULL,
  `severity` int unsigned NOT NULL,
  `status` enum('open','resolved') NOT NULL DEFAULT 'open',
  `started_at` datetime(3) NOT NULL,
  `ends_at` datetime(3),
  `resolved_at` datetime(3),
  `metadata` json,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT `station_incidents_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `station_incidents_station_id_fk` FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `station_incidents_station_status_idx` ON `station_incidents` (`station_id`, `status`);
--> statement-breakpoint

CREATE TABLE `station_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `station_id` varchar(36) NOT NULL,
  `log_type` enum('event','action','audit','system') NOT NULL,
  `message` varchar(400) NOT NULL,
  `payload` json,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT `station_logs_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `station_logs_station_id_fk` FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `station_logs_station_idx` ON `station_logs` (`station_id`, `created_at`);
--> statement-breakpoint

CREATE TABLE `station_run_summaries` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `station_id` varchar(36) NOT NULL,
  `tick_seconds` int unsigned NOT NULL,
  `incident_count` int unsigned NOT NULL,
  `severity` varchar(16) NOT NULL,
  `critical_resources` json NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT `station_run_summaries_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `station_run_summaries_station_id_fk` FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `station_run_summaries_station_idx` ON `station_run_summaries` (`station_id`, `created_at`);
--> statement-breakpoint

CREATE TABLE `station_research_upgrades` (
  `id` varchar(36) NOT NULL,
  `station_id` varchar(36) NOT NULL,
  `upgrade_key` varchar(64) NOT NULL,
  `level` int unsigned NOT NULL DEFAULT 0,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT `station_research_upgrades_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `station_research_upgrades_station_key_unique` UNIQUE (`station_id`, `upgrade_key`),
  CONSTRAINT `station_research_upgrades_station_id_fk` FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint

CREATE TABLE `idempotency_keys` (
  `id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `action` varchar(80) NOT NULL,
  `idempotency_key` varchar(36) NOT NULL,
  `status` enum('pending','completed') NOT NULL DEFAULT 'pending',
  `response_json` json,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT `idempotency_keys_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `idempotency_user_action_key_unique` UNIQUE (`user_id`, `action`, `idempotency_key`),
  CONSTRAINT `idempotency_keys_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint

CREATE TABLE `audit_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` varchar(36),
  `station_id` varchar(36),
  `action` varchar(120) NOT NULL,
  `resource_type` varchar(80) NOT NULL,
  `resource_id` varchar(80),
  `ip_address` varchar(64),
  `user_agent` varchar(255),
  `metadata` json,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT `audit_logs_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `audit_logs_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  CONSTRAINT `audit_logs_station_id_fk` FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX `audit_logs_user_idx` ON `audit_logs` (`user_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `audit_logs_station_idx` ON `audit_logs` (`station_id`, `created_at`);



