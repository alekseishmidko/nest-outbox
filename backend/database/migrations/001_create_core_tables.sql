-- Базовая схема приложения для тренировки SQL, транзакций и Outbox.
-- Миграция рассчитана на MySQL 8.x.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(255) NOT NULL,
  checksum CHAR(64) NULL,
  execution_time_ms INT UNSIGNED NULL,
  applied_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (version)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(320) NOT NULL,
  name VARCHAR(255) NOT NULL,
  avatar_seed VARCHAR(128) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS maps (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  owner_user_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_maps_owner_user_id (owner_user_id),
  CONSTRAINT fk_maps_owner_user_id
    FOREIGN KEY (owner_user_id)
    REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  map_id BIGINT UNSIGNED NOT NULL,
  status ENUM('pending', 'paid', 'completed', 'cancelled', 'failed') NOT NULL DEFAULT 'pending',
  total_amount DECIMAL(10, 2) UNSIGNED NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_orders_user_id (user_id),
  KEY idx_orders_map_id (map_id),
  KEY idx_orders_status (status),
  KEY idx_orders_user_id_status (user_id, status),
  KEY idx_orders_map_id_status (map_id, status),
  CONSTRAINT fk_orders_user_id
    FOREIGN KEY (user_id)
    REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_orders_map_id
    FOREIGN KEY (map_id)
    REFERENCES maps (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS media_assets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_type ENUM('user', 'map', 'order') NOT NULL,
  owner_id BIGINT UNSIGNED NOT NULL,
  type ENUM('qr_code', 'avatar') NOT NULL,
  mime_type VARCHAR(128) NOT NULL,
  storage_type ENUM('database', 'file', 'external') NOT NULL DEFAULT 'database',
  content_base64 LONGTEXT NULL,
  file_path VARCHAR(1024) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_media_assets_owner (owner_type, owner_id),
  KEY idx_media_assets_type (type),
  KEY idx_media_assets_created_at (created_at)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS outbox_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_type VARCHAR(128) NOT NULL,
  aggregate_type VARCHAR(64) NOT NULL,
  aggregate_id BIGINT UNSIGNED NOT NULL,
  payload JSON NOT NULL,
  status ENUM('pending', 'processing', 'processed', 'failed') NOT NULL DEFAULT 'pending',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMP(3) NULL,
  processed_at TIMESTAMP(3) NULL,
  error TEXT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_outbox_events_status (status),
  KEY idx_outbox_events_next_retry_at (next_retry_at),
  KEY idx_outbox_events_status_next_retry_at (status, next_retry_at),
  KEY idx_outbox_events_aggregate (aggregate_type, aggregate_id),
  KEY idx_outbox_events_created_at (created_at)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;
