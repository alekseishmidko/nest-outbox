-- Таблица идемпотентности для защиты POST-запросов от повторного выполнения.
-- Используется для сценариев client timeout/retry: повтор с тем же ключом
-- возвращает сохраненный response и не создает второй заказ.

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  idempotency_key VARCHAR(255) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  status ENUM('processing', 'completed') NOT NULL DEFAULT 'processing',
  response_status_code SMALLINT UNSIGNED NULL,
  response_body JSON NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_idempotency_keys_key (idempotency_key),
  KEY idx_idempotency_keys_status_created_at (status, created_at)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;
