-- Индексы для учебных reports-запросов.
-- Цель: сравнить plans до/после, covering indexes и порядок колонок
-- в composite indexes на аналитических выборках.

CREATE INDEX idx_reports_orders_status_created_covering
  ON orders (status, created_at DESC, user_id, map_id, total_amount, id);

CREATE INDEX idx_reports_orders_created_id
  ON orders (created_at DESC, id DESC);

CREATE INDEX idx_reports_orders_user_amount
  ON orders (user_id, total_amount, id);

CREATE INDEX idx_reports_orders_map_amount
  ON orders (map_id, total_amount, id);
