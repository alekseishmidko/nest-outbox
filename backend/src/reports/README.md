# Reports Module

## Цель

Модуль `reports` нужен для углубленной тренировки SQL-оптимизации на текущей схеме `users`, `maps`, `orders`, `media_assets`.

## Endpoints

- `GET /reports/orders/status-summary` - `GROUP BY` статистика заказов по статусам.
- `GET /reports/users/revenue-ranking` - ranking пользователей через `ROW_NUMBER`, `RANK`, `SUM() OVER`.
- `GET /reports/orders/page` - сравнение `offset` и `cursor` pagination.
- `GET /reports/explain` - `EXPLAIN ANALYZE` для учебных reports-запросов.

## Примеры

```bash
curl 'http://localhost:3000/reports/orders/status-summary'
curl 'http://localhost:3000/reports/users/revenue-ranking?limit=20'
curl 'http://localhost:3000/reports/orders/page?pagination=offset&limit=50&offset=500'
curl 'http://localhost:3000/reports/orders/page?pagination=cursor&limit=50'
curl 'http://localhost:3000/reports/explain?query=orders_page&mode=before'
curl 'http://localhost:3000/reports/explain?query=orders_page&mode=after'
```

## SQL-фокус

- `GROUP BY` и агрегаты `COUNT`, `SUM`, `AVG`, `MIN`, `MAX`.
- Window functions: `ROW_NUMBER`, `RANK`, `SUM() OVER`.
- Covering index для чтения данных из индекса без обращения к полной строке.
- Composite index и порядок колонок: сначала фильтр/группировка, затем сортировка, затем покрывающие поля.
- Сравнение `OFFSET` и cursor pagination на большом объеме данных.

## Индексы

Миграция `004_optimize_reports_queries.sql` добавляет:

```sql
CREATE INDEX idx_reports_orders_status_created_covering
  ON orders (status, created_at DESC, user_id, map_id, total_amount, id);

CREATE INDEX idx_reports_orders_created_id
  ON orders (created_at DESC, id DESC);

CREATE INDEX idx_reports_orders_user_amount
  ON orders (user_id, total_amount, id);

CREATE INDEX idx_reports_orders_map_amount
  ON orders (map_id, total_amount, id);
```

`GET /reports/explain` поддерживает режим `before`, который использует `IGNORE INDEX` для имитации плана до оптимизации, и `after`, который разрешает MySQL использовать новые индексы.

Для `orders/page` в reports-запросе используется `FORCE INDEX (idx_reports_orders_created_id)`, потому что это учебный endpoint для демонстрации порядка composite index под `ORDER BY created_at DESC, id DESC`. В прикладном production-коде `FORCE INDEX` стоит применять осторожно и только после проверки реальных планов.
