-- Индексы для сложного отчета пользователя:
-- users -> orders -> maps -> latest media assets.

CREATE INDEX idx_orders_user_created_id
  ON orders (user_id, created_at DESC, id DESC);

CREATE INDEX idx_media_assets_owner_type_id
  ON media_assets (owner_type, type, owner_id, id);
