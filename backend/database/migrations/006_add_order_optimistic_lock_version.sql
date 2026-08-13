-- Версия строки нужна для optimistic locking конкурентных обновлений заказа.
ALTER TABLE orders
  ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 0 AFTER total_amount;
