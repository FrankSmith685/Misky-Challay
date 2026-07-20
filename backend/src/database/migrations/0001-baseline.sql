-- Migracion inicial: esquema completo de Verde Bowl V3.
--
-- Generada con scripts/dump-baseline.cjs a partir de la base de desarrollo,
-- que hasta ahora se creaba con sequelize.sync(). Congela ese esquema para que
-- produccion pueda levantarse de forma reproducible y sin sync.
--
-- NO editar este archivo. Cualquier cambio posterior va en una migracion nueva.

-- Las tablas van en orden alfabetico, asi que una clave foranea puede apuntar a
-- una tabla que todavia no existe. Se desactiva la comprobacion mientras se crea
-- el esquema y se restaura al terminar.
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE `addresses` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `label` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Casa',
  `line1` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reference` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `district_id` int unsigned DEFAULT NULL,
  `latitude` decimal(10,7) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL,
  `is_default` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `addresses_user_id` (`user_id`),
  KEY `district_id` (`district_id`),
  CONSTRAINT `addresses_ibfk_157` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `addresses_ibfk_158` FOREIGN KEY (`district_id`) REFERENCES `districts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `admin_drafts` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `key` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `scope` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `owner_user_id` bigint unsigned NOT NULL,
  `payload` json NOT NULL,
  `publish_at` datetime DEFAULT NULL,
  `status` enum('DRAFT','SCHEDULED','PUBLISHED','FAILED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DRAFT',
  `error_message` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_admin_drafts_key` (`key`),
  KEY `idx_admin_drafts_schedule` (`status`,`publish_at`),
  KEY `owner_user_id` (`owner_user_id`),
  CONSTRAINT `admin_drafts_ibfk_1` FOREIGN KEY (`owner_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `allergens` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `warning` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_allergens_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `audit_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `actor_id` bigint unsigned DEFAULT NULL,
  `action` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_id` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `before_json` json DEFAULT NULL,
  `after_json` json DEFAULT NULL,
  `ip` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `correlation_id` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_audit_entity` (`entity`,`entity_id`),
  KEY `idx_audit_actor` (`actor_id`),
  CONSTRAINT `audit_logs_ibfk_1` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `branch_inventory` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `branch_id` bigint unsigned NOT NULL,
  `inventory_item_id` bigint unsigned NOT NULL,
  `on_hand` decimal(12,2) NOT NULL DEFAULT '0.00',
  `reserved` decimal(12,2) NOT NULL DEFAULT '0.00',
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_branch_inventory` (`branch_id`,`inventory_item_id`),
  KEY `inventory_item_id` (`inventory_item_id`),
  CONSTRAINT `branch_inventory_ibfk_109` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `branch_inventory_ibfk_110` FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_items` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `branch_option_availability` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `branch_id` bigint unsigned NOT NULL,
  `option_id` bigint unsigned NOT NULL,
  `is_available` tinyint(1) NOT NULL DEFAULT '1',
  `price_override` decimal(12,2) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `available_from` datetime DEFAULT NULL,
  `available_until` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `branch_option_availability_branch_id_option_id` (`branch_id`,`option_id`),
  KEY `option_id` (`option_id`),
  CONSTRAINT `branch_option_availability_ibfk_145` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `branch_option_availability_ibfk_146` FOREIGN KEY (`option_id`) REFERENCES `customization_options` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `branch_product_availability` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `branch_id` bigint unsigned NOT NULL,
  `product_id` bigint unsigned NOT NULL,
  `is_available` tinyint(1) NOT NULL DEFAULT '1',
  `unavailable_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `branch_product_availability_branch_id_product_id` (`branch_id`,`product_id`),
  KEY `product_id` (`product_id`),
  CONSTRAINT `branch_product_availability_ibfk_151` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `branch_product_availability_ibfk_152` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `branch_schedules` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `branch_id` bigint unsigned NOT NULL,
  `weekday` tinyint DEFAULT NULL,
  `exception_date` date DEFAULT NULL,
  `opens_at` varchar(5) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '10:00',
  `closes_at` varchar(5) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '22:00',
  `is_closed` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `branch_schedules_branch_id_weekday` (`branch_id`,`weekday`),
  CONSTRAINT `branch_schedules_ibfk_1` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `branches` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `city_id` int unsigned NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `address_line` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `district_id` int unsigned DEFAULT NULL,
  `latitude` decimal(10,7) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL,
  `phone` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `prep_minutes` int NOT NULL DEFAULT '20',
  `accepts_pickup` tinyint(1) NOT NULL DEFAULT '1',
  `accepts_delivery` tinyint(1) NOT NULL DEFAULT '1',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_branches_slug` (`slug`),
  KEY `city_id` (`city_id`),
  KEY `district_id` (`district_id`),
  CONSTRAINT `branches_ibfk_163` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `branches_ibfk_164` FOREIGN KEY (`district_id`) REFERENCES `districts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `builder_events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `session_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `product_id` bigint unsigned NOT NULL,
  `event_type` enum('VIEW','START','OPTION_SELECT','CONFLICT_RESOLVE','PRESET_APPLY','QUOTE_ERROR','COMPLETE','ADD_TO_CART','SAVE_BOWL','ABANDON') COLLATE utf8mb4_unicode_ci NOT NULL,
  `group_id` int unsigned DEFAULT NULL,
  `option_id` bigint unsigned DEFAULT NULL,
  `preset_id` bigint unsigned DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `builder_events_product_id_created_at` (`product_id`,`created_at`),
  KEY `builder_events_event_type_created_at` (`event_type`,`created_at`),
  KEY `builder_events_session_id` (`session_id`),
  KEY `builder_events_option_id` (`option_id`),
  KEY `user_id` (`user_id`),
  KEY `group_id` (`group_id`),
  KEY `preset_id` (`preset_id`),
  CONSTRAINT `builder_events_ibfk_281` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `builder_events_ibfk_282` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `builder_events_ibfk_283` FOREIGN KEY (`group_id`) REFERENCES `customization_groups` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `builder_events_ibfk_284` FOREIGN KEY (`option_id`) REFERENCES `customization_options` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `builder_events_ibfk_285` FOREIGN KEY (`preset_id`) REFERENCES `builder_presets` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `builder_preset_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `preset_id` bigint unsigned NOT NULL,
  `option_id` bigint unsigned NOT NULL,
  `quantity` int unsigned NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `builder_preset_items_preset_id_option_id` (`preset_id`,`option_id`),
  KEY `option_id` (`option_id`),
  CONSTRAINT `builder_preset_items_ibfk_131` FOREIGN KEY (`preset_id`) REFERENCES `builder_presets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `builder_preset_items_ibfk_132` FOREIGN KEY (`option_id`) REFERENCES `customization_options` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `builder_presets` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `product_id` bigint unsigned NOT NULL,
  `code` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `image_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `badge` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_featured` tinyint(1) NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `builder_presets_product_id_code` (`product_id`,`code`),
  KEY `builder_presets_product_id_is_active_sort_order` (`product_id`,`is_active`,`sort_order`),
  CONSTRAINT `builder_presets_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `categories` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `parent_id` int unsigned DEFAULT NULL,
  `name` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `image_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_categories_slug` (`slug`),
  KEY `parent_id` (`parent_id`),
  CONSTRAINT `categories_ibfk_1` FOREIGN KEY (`parent_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `cities` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `country` varchar(2) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PE',
  `currency` varchar(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PEN',
  `timezone` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'America/Lima',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cities_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `coupon_redemptions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `coupon_id` int unsigned NOT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `order_id` bigint unsigned NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `status` enum('RESERVED','CONFIRMED','RELEASED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'RESERVED',
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_coupon_redemptions_order` (`coupon_id`,`order_id`),
  KEY `idx_coupon_redemptions_user` (`coupon_id`,`user_id`),
  KEY `user_id` (`user_id`),
  KEY `order_id` (`order_id`),
  CONSTRAINT `coupon_redemptions_ibfk_166` FOREIGN KEY (`coupon_id`) REFERENCES `coupons` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `coupon_redemptions_ibfk_167` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `coupon_redemptions_ibfk_168` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `coupons` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `discount_type` enum('PERCENT','FIXED','FREE_DELIVERY') COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` decimal(12,2) NOT NULL DEFAULT '0.00',
  `min_order_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `max_discount_amount` decimal(12,2) DEFAULT NULL,
  `valid_from` datetime DEFAULT NULL,
  `valid_until` datetime DEFAULT NULL,
  `usage_limit` int DEFAULT NULL,
  `usage_limit_per_user` int NOT NULL DEFAULT '1',
  `used_count` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_coupons_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `coverage_zones` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `city_id` int unsigned NOT NULL,
  `name` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `polygon` json DEFAULT NULL,
  `delivery_fee` decimal(12,2) NOT NULL DEFAULT '0.00',
  `minimum_order` decimal(12,2) NOT NULL DEFAULT '0.00',
  `estimated_minutes` int NOT NULL DEFAULT '45',
  `priority` int NOT NULL DEFAULT '1',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `city_id` (`city_id`),
  CONSTRAINT `coverage_zones_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `customization_groups` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `selection_type` enum('SINGLE','MULTIPLE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'SINGLE',
  `min_selection` int NOT NULL DEFAULT '0',
  `max_selection` int NOT NULL DEFAULT '1',
  `free_quantity` int NOT NULL DEFAULT '0',
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_customization_groups_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `customization_options` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `group_id` int unsigned NOT NULL,
  `ingredient_id` bigint unsigned DEFAULT NULL,
  `name` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `image_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `price_delta` decimal(12,2) NOT NULL DEFAULT '0.00',
  `charge_always` tinyint(1) NOT NULL DEFAULT '0',
  `calories` decimal(8,2) NOT NULL DEFAULT '0.00',
  `protein` decimal(8,2) NOT NULL DEFAULT '0.00',
  `carbs` decimal(8,2) NOT NULL DEFAULT '0.00',
  `fat` decimal(8,2) NOT NULL DEFAULT '0.00',
  `max_per_item` int NOT NULL DEFAULT '1',
  `inventory_item_id` bigint unsigned DEFAULT NULL,
  `consumption_quantity` decimal(12,2) NOT NULL DEFAULT '0.00',
  `status` enum('ACTIVE','OUT_OF_STOCK','INACTIVE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `image_alt` varchar(180) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `image_position` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '50% 50%',
  `dietary_tags` json NOT NULL,
  `allergens` json NOT NULL,
  `spice_level` tinyint unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `customization_options_group_id` (`group_id`),
  KEY `customization_options_status` (`status`),
  KEY `inventory_item_id` (`inventory_item_id`),
  CONSTRAINT `customization_options_ibfk_147` FOREIGN KEY (`group_id`) REFERENCES `customization_groups` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `customization_options_ibfk_148` FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_items` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `deliveries` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `order_id` bigint unsigned NOT NULL,
  `branch_id` bigint unsigned NOT NULL,
  `carrier` enum('OWN','EXTERNAL') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'OWN',
  `driver_id` bigint unsigned DEFAULT NULL,
  `external_provider` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `external_reference` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('PENDING','ASSIGNED','PICKED_UP','ON_ROUTE','DELIVERED','FAILED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `cost` decimal(12,2) NOT NULL DEFAULT '0.00',
  `eta_minutes` int DEFAULT NULL,
  `assigned_at` datetime DEFAULT NULL,
  `picked_up_at` datetime DEFAULT NULL,
  `delivered_at` datetime DEFAULT NULL,
  `proof_json` json DEFAULT NULL,
  `failure_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_deliveries_order` (`order_id`),
  KEY `idx_deliveries_branch_status` (`branch_id`,`status`),
  KEY `driver_id` (`driver_id`),
  CONSTRAINT `deliveries_ibfk_160` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `deliveries_ibfk_161` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `deliveries_ibfk_162` FOREIGN KEY (`driver_id`) REFERENCES `drivers` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `delivery_events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `delivery_id` bigint unsigned NOT NULL,
  `from_status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `to_status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `actor_id` bigint unsigned DEFAULT NULL,
  `latitude` decimal(10,7) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL,
  `comment` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_delivery_events_delivery` (`delivery_id`),
  CONSTRAINT `delivery_events_ibfk_1` FOREIGN KEY (`delivery_id`) REFERENCES `deliveries` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `delivery_slots` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `branch_id` bigint unsigned NOT NULL,
  `coverage_zone_id` int unsigned DEFAULT NULL,
  `starts_at` datetime NOT NULL,
  `ends_at` datetime NOT NULL,
  `capacity` int NOT NULL DEFAULT '20',
  `reserved_count` int NOT NULL DEFAULT '0',
  `confirmed_count` int NOT NULL DEFAULT '0',
  `order_cutoff_at` datetime NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `delivery_slots_branch_id_starts_at` (`branch_id`,`starts_at`),
  KEY `coverage_zone_id` (`coverage_zone_id`),
  CONSTRAINT `delivery_slots_ibfk_153` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `delivery_slots_ibfk_154` FOREIGN KEY (`coverage_zone_id`) REFERENCES `coverage_zones` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `dietary_tags` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `color` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dietary_tags_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `districts` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `city_id` int unsigned NOT NULL,
  `coverage_zone_id` int unsigned DEFAULT NULL,
  `ubigeo_code` varchar(6) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `districts_city_id_slug` (`city_id`,`slug`),
  UNIQUE KEY `uq_districts_ubigeo_code` (`ubigeo_code`),
  KEY `coverage_zone_id` (`coverage_zone_id`),
  CONSTRAINT `districts_ibfk_165` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `districts_ibfk_166` FOREIGN KEY (`coverage_zone_id`) REFERENCES `coverage_zones` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `drivers` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned DEFAULT NULL,
  `branch_id` bigint unsigned NOT NULL,
  `full_name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('AVAILABLE','BUSY','OFFLINE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'AVAILABLE',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_drivers_branch_status` (`branch_id`,`status`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `drivers_ibfk_107` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `drivers_ibfk_108` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `inventory_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `unit` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'g',
  `unit_cost` decimal(12,4) NOT NULL DEFAULT '0.0000',
  `min_level` decimal(12,2) NOT NULL DEFAULT '0.00',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_inventory_items_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `inventory_movements` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `branch_id` bigint unsigned NOT NULL,
  `inventory_item_id` bigint unsigned NOT NULL,
  `type` enum('PURCHASE','RESERVE','RELEASE','CONSUME','WASTE','ADJUSTMENT') COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` decimal(12,2) NOT NULL,
  `on_hand_after` decimal(12,2) NOT NULL DEFAULT '0.00',
  `reserved_after` decimal(12,2) NOT NULL DEFAULT '0.00',
  `order_id` bigint unsigned DEFAULT NULL,
  `actor_id` bigint unsigned DEFAULT NULL,
  `reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_inv_mov_branch_item` (`branch_id`,`inventory_item_id`),
  KEY `idx_inv_mov_order` (`order_id`),
  KEY `inventory_item_id` (`inventory_item_id`),
  CONSTRAINT `inventory_movements_ibfk_160` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `inventory_movements_ibfk_161` FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_items` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `inventory_movements_ibfk_162` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `kitchen_ticket_events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `ticket_id` bigint unsigned NOT NULL,
  `from_status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `to_status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `actor_id` bigint unsigned DEFAULT NULL,
  `comment` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_kte_ticket` (`ticket_id`),
  CONSTRAINT `kitchen_ticket_events_ibfk_1` FOREIGN KEY (`ticket_id`) REFERENCES `kitchen_tickets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `kitchen_tickets` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `order_id` bigint unsigned NOT NULL,
  `branch_id` bigint unsigned NOT NULL,
  `status` enum('QUEUED','ACCEPTED','PREPARING','READY','DISPATCHED','CANCELLED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'QUEUED',
  `priority` int NOT NULL DEFAULT '1',
  `target_at` datetime NOT NULL,
  `accepted_at` datetime DEFAULT NULL,
  `started_at` datetime DEFAULT NULL,
  `ready_at` datetime DEFAULT NULL,
  `dispatched_at` datetime DEFAULT NULL,
  `prep_minutes_actual` int DEFAULT NULL,
  `notes` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_kitchen_tickets_order` (`order_id`),
  KEY `idx_kitchen_tickets_board` (`branch_id`,`status`,`target_at`),
  CONSTRAINT `kitchen_tickets_ibfk_111` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `kitchen_tickets_ibfk_112` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `media_assets` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `original_name` varchar(180) COLLATE utf8mb4_unicode_ci NOT NULL,
  `filename` varchar(180) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mime_type` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `size_bytes` int unsigned NOT NULL,
  `url` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `alt_text` varchar(180) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `category` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ingredients',
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `media_assets_filename` (`filename`),
  KEY `media_assets_category` (`category`),
  KEY `media_assets_created_at` (`created_at`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `media_assets_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `notifications` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned DEFAULT NULL,
  `channel` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'EMAIL',
  `template` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `recipient` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `subject` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('SENT','FAILED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'SENT',
  `provider` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `provider_message_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `error_message` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `order_id` bigint unsigned DEFAULT NULL,
  `idempotency_key` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sent_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_notifications_idempotency` (`idempotency_key`),
  KEY `idx_notifications_user` (`user_id`),
  KEY `idx_notifications_order` (`order_id`),
  CONSTRAINT `notifications_ibfk_105` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `notifications_ibfk_106` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `option_incompatibilities` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `option_id` bigint unsigned NOT NULL,
  `incompatible_option_id` bigint unsigned NOT NULL,
  `reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `option_incompatibilities_option_id_incompatible_option_id` (`option_id`,`incompatible_option_id`),
  CONSTRAINT `option_incompatibilities_ibfk_1` FOREIGN KEY (`option_id`) REFERENCES `customization_options` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `order_discounts` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `order_id` bigint unsigned NOT NULL,
  `source` enum('COUPON','PROMOTION','PLAN_BENEFIT','MANUAL') COLLATE utf8mb4_unicode_ci NOT NULL,
  `reference_id` bigint unsigned DEFAULT NULL,
  `code` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_order_discounts_order` (`order_id`),
  CONSTRAINT `order_discounts_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `order_item_customizations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `order_item_id` bigint unsigned NOT NULL,
  `group_id` int unsigned DEFAULT NULL,
  `group_name_snapshot` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `option_id` bigint unsigned DEFAULT NULL,
  `option_name_snapshot` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` int NOT NULL DEFAULT '1',
  `price_delta` decimal(12,2) NOT NULL DEFAULT '0.00',
  `line_extra` decimal(12,2) NOT NULL DEFAULT '0.00',
  `nutrition_snapshot_json` json DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_oic_item` (`order_item_id`),
  CONSTRAINT `order_item_customizations_ibfk_1` FOREIGN KEY (`order_item_id`) REFERENCES `order_items` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `order_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `order_id` bigint unsigned NOT NULL,
  `product_id` bigint unsigned DEFAULT NULL,
  `variant_id` bigint unsigned DEFAULT NULL,
  `product_name_snapshot` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `variant_name_snapshot` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description_snapshot` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quantity` int NOT NULL DEFAULT '1',
  `unit_price` decimal(12,2) NOT NULL,
  `extras_total` decimal(12,2) NOT NULL DEFAULT '0.00',
  `discount_total` decimal(12,2) NOT NULL DEFAULT '0.00',
  `line_total` decimal(12,2) NOT NULL,
  `nutrition_snapshot_json` json DEFAULT NULL,
  `allergen_snapshot_json` json DEFAULT NULL,
  `special_instructions` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_order_items_order` (`order_id`),
  CONSTRAINT `order_items_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `order_status_history` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `order_id` bigint unsigned NOT NULL,
  `from_status` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `to_status` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `actor_id` bigint unsigned DEFAULT NULL,
  `source` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'SYSTEM',
  `comment` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_osh_order` (`order_id`),
  CONSTRAINT `order_status_history_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `orders` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `order_number` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `branch_id` bigint unsigned NOT NULL,
  `coverage_zone_id` int unsigned DEFAULT NULL,
  `delivery_type` enum('DELIVERY','PICKUP') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DELIVERY',
  `service_mode` enum('ASAP','SCHEDULED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ASAP',
  `delivery_slot_id` bigint unsigned DEFAULT NULL,
  `scheduled_at` datetime DEFAULT NULL,
  `status` enum('PENDING_PAYMENT','CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED','CANCELLED','REFUNDED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING_PAYMENT',
  `address_snapshot_json` json DEFAULT NULL,
  `contact_name` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contact_phone` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `subtotal` decimal(12,2) NOT NULL DEFAULT '0.00',
  `delivery_fee` decimal(12,2) NOT NULL DEFAULT '0.00',
  `discount_total` decimal(12,2) NOT NULL DEFAULT '0.00',
  `wallet_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `tax_total` decimal(12,2) NOT NULL DEFAULT '0.00',
  `grand_total` decimal(12,2) NOT NULL DEFAULT '0.00',
  `currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PEN',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `cancel_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `idempotency_key` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `placed_at` datetime NOT NULL,
  `confirmed_at` datetime DEFAULT NULL,
  `delivered_at` datetime DEFAULT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_orders_number` (`order_number`),
  UNIQUE KEY `uq_orders_idempotency` (`idempotency_key`),
  KEY `idx_orders_user` (`user_id`),
  KEY `idx_orders_branch_status` (`branch_id`,`status`),
  KEY `idx_orders_scheduled` (`scheduled_at`),
  KEY `idx_orders_status_placed` (`status`,`placed_at`),
  KEY `idx_orders_branch_placed` (`branch_id`,`placed_at`),
  KEY `coverage_zone_id` (`coverage_zone_id`),
  KEY `delivery_slot_id` (`delivery_slot_id`),
  CONSTRAINT `orders_ibfk_249` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `orders_ibfk_250` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `orders_ibfk_251` FOREIGN KEY (`coverage_zone_id`) REFERENCES `coverage_zones` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `orders_ibfk_252` FOREIGN KEY (`delivery_slot_id`) REFERENCES `delivery_slots` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `payment_attempts` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `payment_id` bigint unsigned NOT NULL,
  `idempotency_key` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `request_json` json DEFAULT NULL,
  `response_json` json DEFAULT NULL,
  `success` tinyint(1) NOT NULL DEFAULT '0',
  `error_message` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_payment_attempts_payment` (`payment_id`),
  CONSTRAINT `payment_attempts_ibfk_1` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `payments` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `payable_type` enum('ORDER','PLAN_PURCHASE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ORDER',
  `payable_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `provider` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `provider_reference` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `method` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amount` decimal(12,2) NOT NULL,
  `currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PEN',
  `status` enum('CREATED','PENDING','SUCCEEDED','FAILED','REFUNDED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'CREATED',
  `idempotency_key` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `checkout_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `failure_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `safe_response_json` json DEFAULT NULL,
  `authorized_at` datetime DEFAULT NULL,
  `captured_at` datetime DEFAULT NULL,
  `failed_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_payments_idempotency` (`idempotency_key`),
  KEY `idx_payments_reference` (`provider_reference`),
  KEY `idx_payments_payable` (`payable_type`,`payable_id`),
  KEY `idx_payments_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `permissions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `module` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_permissions_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `plan_benefits` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `plan_id` int unsigned NOT NULL,
  `type` enum('DISCOUNT_PERCENT','FREE_DELIVERY') COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` decimal(12,2) NOT NULL DEFAULT '0.00',
  `max_amount_per_order` decimal(12,2) DEFAULT NULL,
  `description` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_plan_benefits` (`plan_id`,`type`),
  CONSTRAINT `plan_benefits_ibfk_1` FOREIGN KEY (`plan_id`) REFERENCES `plans` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `plans` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `city_id` int unsigned DEFAULT NULL,
  `code` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `price` decimal(12,2) NOT NULL,
  `granted_credit` decimal(12,2) NOT NULL,
  `currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PEN',
  `validity_days` int NOT NULL DEFAULT '30',
  `is_featured` tinyint(1) NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_plans_code` (`code`),
  KEY `city_id` (`city_id`),
  CONSTRAINT `plans_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `product_allergens` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `product_id` bigint unsigned NOT NULL,
  `allergen_id` int unsigned NOT NULL,
  `level` enum('CONTAINS','MAY_CONTAIN') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'CONTAINS',
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `product_allergens_allergenId_productId_unique` (`product_id`,`allergen_id`),
  UNIQUE KEY `product_allergens_product_id_allergen_id` (`product_id`,`allergen_id`),
  KEY `allergen_id` (`allergen_id`),
  CONSTRAINT `product_allergens_ibfk_151` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `product_allergens_ibfk_152` FOREIGN KEY (`allergen_id`) REFERENCES `allergens` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `product_customization_groups` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `product_id` bigint unsigned NOT NULL,
  `group_id` int unsigned NOT NULL,
  `variant_id` bigint unsigned DEFAULT NULL,
  `min_selection_override` int DEFAULT NULL,
  `max_selection_override` int DEFAULT NULL,
  `free_quantity_override` int DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `product_customization_groups_groupId_productId_unique` (`product_id`,`group_id`),
  UNIQUE KEY `product_customization_groups_product_id_group_id_variant_id` (`product_id`,`group_id`,`variant_id`),
  KEY `group_id` (`group_id`),
  CONSTRAINT `product_customization_groups_ibfk_145` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `product_customization_groups_ibfk_146` FOREIGN KEY (`group_id`) REFERENCES `customization_groups` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `product_dietary_tags` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `product_id` bigint unsigned NOT NULL,
  `dietary_tag_id` int unsigned NOT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `product_dietary_tags_dietaryTagId_productId_unique` (`product_id`,`dietary_tag_id`),
  UNIQUE KEY `product_dietary_tags_product_id_dietary_tag_id` (`product_id`,`dietary_tag_id`),
  KEY `dietary_tag_id` (`dietary_tag_id`),
  CONSTRAINT `product_dietary_tags_ibfk_151` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `product_dietary_tags_ibfk_152` FOREIGN KEY (`dietary_tag_id`) REFERENCES `dietary_tags` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `product_nutrition` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `product_id` bigint unsigned NOT NULL,
  `variant_id` bigint unsigned DEFAULT NULL,
  `calories` decimal(8,2) NOT NULL DEFAULT '0.00',
  `protein` decimal(8,2) NOT NULL DEFAULT '0.00',
  `carbs` decimal(8,2) NOT NULL DEFAULT '0.00',
  `fat` decimal(8,2) NOT NULL DEFAULT '0.00',
  `fiber` decimal(8,2) NOT NULL DEFAULT '0.00',
  `sodium` decimal(8,2) NOT NULL DEFAULT '0.00',
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `product_nutrition_variant_id` (`variant_id`),
  KEY `product_nutrition_product_id` (`product_id`),
  CONSTRAINT `product_nutrition_ibfk_151` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `product_nutrition_ibfk_152` FOREIGN KEY (`variant_id`) REFERENCES `product_variants` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `product_variants` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `product_id` bigint unsigned NOT NULL,
  `name` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sku` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `base_price` decimal(12,2) NOT NULL,
  `serving_size` decimal(8,2) DEFAULT NULL,
  `serving_unit` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'g',
  `is_default` tinyint(1) NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_product_variants_sku` (`sku`),
  KEY `idx_product_variants_product` (`product_id`),
  CONSTRAINT `product_variants_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `products` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `category_id` int unsigned NOT NULL,
  `type` enum('FIXED','CUSTOMIZABLE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'FIXED',
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `image_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('DRAFT','ACTIVE','INACTIVE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `is_featured` tinyint(1) NOT NULL DEFAULT '0',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `image_alt` varchar(180) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `image_position` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '50% 50%',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_products_slug` (`slug`),
  KEY `idx_products_category` (`category_id`),
  KEY `idx_products_status` (`status`),
  CONSTRAINT `products_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `recipe_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `recipe_id` bigint unsigned NOT NULL,
  `inventory_item_id` bigint unsigned NOT NULL,
  `quantity` decimal(12,2) NOT NULL,
  `waste_percent` decimal(5,2) NOT NULL DEFAULT '0.00',
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_recipe_items` (`recipe_id`,`inventory_item_id`),
  KEY `inventory_item_id` (`inventory_item_id`),
  CONSTRAINT `recipe_items_ibfk_107` FOREIGN KEY (`recipe_id`) REFERENCES `recipes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `recipe_items_ibfk_108` FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_items` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `recipes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `product_id` bigint unsigned NOT NULL,
  `variant_id` bigint unsigned NOT NULL,
  `yield_quantity` int NOT NULL DEFAULT '1',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_recipes_variant` (`variant_id`),
  KEY `product_id` (`product_id`),
  CONSTRAINT `recipes_ibfk_107` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `recipes_ibfk_108` FOREIGN KEY (`variant_id`) REFERENCES `product_variants` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `refunds` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `payment_id` bigint unsigned NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `reason` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('PENDING','SUCCEEDED','FAILED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `provider_reference` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `approved_by` bigint unsigned DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_refunds_payment` (`payment_id`),
  CONSTRAINT `refunds_ibfk_1` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `role_permissions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `role_id` int unsigned NOT NULL,
  `permission_id` int unsigned NOT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `role_permissions_permissionId_roleId_unique` (`role_id`,`permission_id`),
  UNIQUE KEY `role_permissions_role_id_permission_id` (`role_id`,`permission_id`),
  KEY `permission_id` (`permission_id`),
  CONSTRAINT `role_permissions_ibfk_157` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `role_permissions_ibfk_158` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `roles` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_system` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_roles_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `saved_bowls` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `product_id` bigint unsigned NOT NULL,
  `variant_id` bigint unsigned NOT NULL,
  `name` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `selections` json NOT NULL,
  `last_ordered_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `saved_bowls_user_id_updated_at` (`user_id`,`updated_at`),
  KEY `saved_bowls_product_id` (`product_id`),
  KEY `variant_id` (`variant_id`),
  CONSTRAINT `saved_bowls_ibfk_196` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `saved_bowls_ibfk_197` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `saved_bowls_ibfk_198` FOREIGN KEY (`variant_id`) REFERENCES `product_variants` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `user_plans` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `plan_id` int unsigned NOT NULL,
  `status` enum('PENDING_PAYMENT','ACTIVE','EXPIRED','CANCELLED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING_PAYMENT',
  `plan_name_snapshot` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `price_snapshot` decimal(12,2) NOT NULL,
  `credit_snapshot` decimal(12,2) NOT NULL,
  `validity_days_snapshot` int NOT NULL,
  `starts_at` datetime DEFAULT NULL,
  `expires_at` datetime DEFAULT NULL,
  `activated_at` datetime DEFAULT NULL,
  `expired_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_user_plans_user_status` (`user_id`,`status`),
  KEY `idx_user_plans_expires` (`expires_at`),
  KEY `plan_id` (`plan_id`),
  CONSTRAINT `user_plans_ibfk_105` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `user_plans_ibfk_106` FOREIGN KEY (`plan_id`) REFERENCES `plans` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `user_preferences` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `allergens` json NOT NULL,
  `dietary_tags` json NOT NULL,
  `disliked_option_ids` json NOT NULL,
  `calorie_target` int unsigned DEFAULT NULL,
  `protein_target` int unsigned DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_preferences_user` (`user_id`),
  CONSTRAINT `user_preferences_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `user_roles` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `role_id` int unsigned NOT NULL,
  `branch_id` bigint unsigned DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_roles_roleId_userId_unique` (`user_id`,`role_id`),
  UNIQUE KEY `uq_user_roles_user_role_branch` (`user_id`,`role_id`,`branch_id`),
  KEY `role_id` (`role_id`),
  KEY `branch_id` (`branch_id`),
  CONSTRAINT `user_roles_ibfk_235` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `user_roles_ibfk_236` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `user_roles_ibfk_237` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `email` varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `first_name` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_name` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('PENDING','ACTIVE','BLOCKED','DELETED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `is_super_admin` tinyint(1) NOT NULL DEFAULT '0',
  `token_version` int unsigned NOT NULL DEFAULT '0',
  `email_verified_at` datetime DEFAULT NULL,
  `last_login_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`),
  UNIQUE KEY `uq_users_phone` (`phone`),
  KEY `idx_users_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `ux_events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `session_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `event_type` enum('COVERAGE_SUCCESS','COVERAGE_FAIL','COVERAGE_ERROR','CHECKOUT_START','CHECKOUT_ERROR','PAYMENT_REDIRECT') COLLATE utf8mb4_unicode_ci NOT NULL,
  `metadata` json DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ux_events_event_type_created_at` (`event_type`,`created_at`),
  KEY `ux_events_session_id` (`session_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `ux_events_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `wallet_transactions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `wallet_id` bigint unsigned NOT NULL,
  `type` enum('CREDIT','DEBIT','ADJUSTMENT','EXPIRATION','REFUND') COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `balance_after` decimal(12,2) NOT NULL,
  `user_plan_id` bigint unsigned DEFAULT NULL,
  `order_id` bigint unsigned DEFAULT NULL,
  `expires_at` datetime DEFAULT NULL,
  `idempotency_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_wallet_tx_idempotency` (`idempotency_key`),
  KEY `idx_wallet_tx_wallet` (`wallet_id`),
  KEY `idx_wallet_tx_order` (`order_id`),
  KEY `user_plan_id` (`user_plan_id`),
  CONSTRAINT `wallet_transactions_ibfk_157` FOREIGN KEY (`wallet_id`) REFERENCES `wallets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `wallet_transactions_ibfk_158` FOREIGN KEY (`user_plan_id`) REFERENCES `user_plans` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `wallet_transactions_ibfk_159` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `wallets` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PEN',
  `balance` decimal(12,2) NOT NULL DEFAULT '0.00',
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_wallets_user_currency` (`user_id`,`currency`),
  CONSTRAINT `wallets_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `webhook_events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `provider` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `event_id` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `event_type` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `payload_json` json DEFAULT NULL,
  `processed_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_webhook_events_event` (`provider`,`event_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `zone_branches` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `coverage_zone_id` int unsigned NOT NULL,
  `branch_id` bigint unsigned NOT NULL,
  `priority` int NOT NULL DEFAULT '1',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `zone_branches_branchId_coverageZoneId_unique` (`coverage_zone_id`,`branch_id`),
  UNIQUE KEY `zone_branches_coverage_zone_id_branch_id` (`coverage_zone_id`,`branch_id`),
  KEY `branch_id` (`branch_id`),
  CONSTRAINT `zone_branches_ibfk_153` FOREIGN KEY (`coverage_zone_id`) REFERENCES `coverage_zones` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `zone_branches_ibfk_154` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
