CREATE TABLE order_sagas (
  order_id BIGINT UNSIGNED NOT NULL,
  status ENUM('running', 'completed', 'failed') NOT NULL DEFAULT 'running',
  current_stage ENUM('avatar', 'qr', 'completed') NOT NULL DEFAULT 'avatar',
  completed_stages JSON NOT NULL,
  last_error VARCHAR(4000) NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (order_id),
  CONSTRAINT fk_order_sagas_order
    FOREIGN KEY (order_id) REFERENCES orders (id)
    ON DELETE CASCADE
);
