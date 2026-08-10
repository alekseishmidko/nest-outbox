-- Надежность Outbox: dead-letter, ручная причина retry и idempotency ledger
-- для обработчиков событий.

ALTER TABLE outbox_events
  MODIFY status ENUM('pending', 'processing', 'processed', 'failed', 'dead_letter')
    NOT NULL DEFAULT 'pending';

ALTER TABLE outbox_events
  ADD COLUMN manual_retry_reason TEXT NULL AFTER error;

CREATE TABLE IF NOT EXISTS processed_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  idempotency_key VARCHAR(255) NOT NULL,
  outbox_event_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(128) NOT NULL,
  aggregate_type VARCHAR(64) NOT NULL,
  aggregate_id BIGINT UNSIGNED NOT NULL,
  status ENUM('processing', 'processed') NOT NULL DEFAULT 'processing',
  processed_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_processed_events_idempotency_key (idempotency_key),
  KEY idx_processed_events_event (event_type, aggregate_type, aggregate_id),
  KEY idx_processed_events_outbox_event_id (outbox_event_id),
  CONSTRAINT fk_processed_events_outbox_event_id
    FOREIGN KEY (outbox_event_id)
    REFERENCES outbox_events (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;
