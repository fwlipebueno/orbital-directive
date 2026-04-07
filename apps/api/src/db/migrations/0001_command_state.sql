CREATE TABLE `station_command_states` (
  `station_id` varchar(36) NOT NULL,
  `power_profile` enum('balanced','lifeSupport','research','shielded') NOT NULL DEFAULT 'balanced',
  `subsystem_focus` enum('balanced','integrity','research','morale') NOT NULL DEFAULT 'balanced',
  `thermal_policy` enum('nominal','economy','boost') NOT NULL DEFAULT 'nominal',
  `last_orbital_burn_at` datetime(3),
  `last_reserve_deploy_at` datetime(3),
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT `station_command_states_station_id_pk` PRIMARY KEY (`station_id`),
  CONSTRAINT `station_command_states_station_id_fk` FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON DELETE CASCADE
);

