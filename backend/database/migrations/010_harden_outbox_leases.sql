-- Диагностика ошибок и fencing lease для нескольких Outbox worker-инстансов.
ALTER TABLE outbox_events
  ADD COLUMN error_code VARCHAR(128) NULL AFTER error,
  ADD COLUMN error_stack TEXT NULL AFTER error_code,
  ADD COLUMN dead_letter_reason TEXT NULL AFTER error_stack,
  ADD COLUMN lease_owner VARCHAR(128) NULL AFTER dead_letter_reason,
  ADD COLUMN lease_token CHAR(36) NULL AFTER lease_owner,
  ADD COLUMN lease_expires_at TIMESTAMP(3) NULL AFTER lease_token,
  ADD COLUMN fencing_token BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER lease_expires_at,
  ADD KEY idx_outbox_events_lease (status, lease_expires_at),
  ADD KEY idx_outbox_events_fencing (id, fencing_token);
