ALTER TABLE users
  ADD COLUMN deleted_at TIMESTAMP(3) NULL AFTER updated_at,
  ADD COLUMN created_by BIGINT UNSIGNED NULL AFTER deleted_at,
  ADD COLUMN updated_by BIGINT UNSIGNED NULL AFTER created_by,
  ADD KEY idx_users_deleted_at (deleted_at);

ALTER TABLE maps
  ADD COLUMN deleted_at TIMESTAMP(3) NULL AFTER updated_at,
  ADD COLUMN created_by BIGINT UNSIGNED NULL AFTER deleted_at,
  ADD COLUMN updated_by BIGINT UNSIGNED NULL AFTER created_by,
  ADD KEY idx_maps_deleted_at (deleted_at);

ALTER TABLE orders
  ADD COLUMN deleted_at TIMESTAMP(3) NULL AFTER updated_at,
  ADD COLUMN created_by BIGINT UNSIGNED NULL AFTER deleted_at,
  ADD COLUMN updated_by BIGINT UNSIGNED NULL AFTER created_by,
  ADD KEY idx_orders_deleted_at (deleted_at);

CREATE TABLE audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id BIGINT UNSIGNED NULL,
  action VARCHAR(64) NOT NULL,
  entity_type VARCHAR(64) NOT NULL,
  entity_id BIGINT UNSIGNED NOT NULL,
  before_json JSON NULL,
  after_json JSON NULL,
  request_id VARCHAR(128) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_audit_log_entity (entity_type, entity_id, created_at),
  KEY idx_audit_log_actor (actor_user_id, created_at),
  KEY idx_audit_log_request (request_id),
  CONSTRAINT fk_audit_log_actor
    FOREIGN KEY (actor_user_id) REFERENCES users (id)
    ON DELETE SET NULL
);
