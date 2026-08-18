-- Inbox для идемпотентной обработки входящих событий.
CREATE TABLE IF NOT EXISTS inbox_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(128) NOT NULL,
  payload JSON NOT NULL,
  status ENUM('received', 'processing', 'processed', 'failed', 'dead_letter')
    NOT NULL DEFAULT 'received',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMP(3) NULL,
  processed_at TIMESTAMP(3) NULL,
  last_error TEXT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_inbox_events_event_id (event_id),
  KEY idx_inbox_events_due (status, next_retry_at, created_at),
  KEY idx_inbox_events_type_status (event_type, status)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;
