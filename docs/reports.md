# Reports и SQL-оптимизация

## Цель

Reports-модуль добавляет тяжелые аналитические запросы, на которых удобно тренировать:

- `GROUP BY`;
- window functions;
- `EXPLAIN ANALYZE`;
- covering indexes;
- порядок колонок в composite indexes;
- сравнение offset и cursor pagination.

## Endpoints

### GROUP BY по статусам

```bash
curl 'http://localhost:3000/reports/orders/status-summary'
```

SQL:

```sql
SELECT
  status,
  COUNT(*) AS orders_count,
  COALESCE(SUM(total_amount), 0) AS total_amount_sum,
  AVG(total_amount) AS average_order_amount,
  MIN(total_amount) AS min_order_amount,
  MAX(total_amount) AS max_order_amount
FROM orders
GROUP BY status
ORDER BY orders_count DESC, status ASC;
```

Что смотреть:

- использует ли MySQL индекс по `status`;
- появляется ли temporary table;
- нужен ли covering index, если отчет часто читается.

### Ranking пользователей

```bash
curl 'http://localhost:3000/reports/users/revenue-ranking?limit=20'
```

SQL использует:

- `ROW_NUMBER() OVER (...)`;
- `RANK() OVER (...)`;
- `SUM(total_amount_sum) OVER (...)`.

Задача запроса: сначала агрегировать заказы по пользователям, затем построить ranking и накопительную сумму выручки.

### Offset pagination

```bash
curl 'http://localhost:3000/reports/orders/page?pagination=offset&limit=50&offset=500'
```

Проблема: чем глубже `OFFSET`, тем больше строк MySQL должен пройти и отбросить до выдачи нужной страницы.

### Cursor pagination

```bash
curl 'http://localhost:3000/reports/orders/page?pagination=cursor&limit=50'
```

Следующая страница берется по `nextCursor` из `pageInfo`.

Плюс: MySQL идет от последней известной позиции `(created_at, id)`, а не пропускает растущий offset.

## EXPLAIN ANALYZE до и после

До оптимизации:

```bash
curl 'http://localhost:3000/reports/explain?query=orders_page&mode=before'
```

После оптимизации:

```bash
curl 'http://localhost:3000/reports/explain?query=orders_page&mode=after'
```

`mode=before` использует `IGNORE INDEX`, чтобы имитировать план без новых reports-индексов. Это учебный прием: миграции остаются примененными, но можно сравнить поведение оптимизатора.

Доступные значения `query`:

- `orders_page`;
- `status_summary`;
- `user_ranking`.

## Covering indexes

Covering index помогает, когда MySQL может прочитать нужные поля прямо из индекса.

Пример:

```sql
CREATE INDEX idx_reports_orders_status_created_covering
  ON orders (status, created_at DESC, user_id, map_id, total_amount, id);
```

Этот индекс полезен для отчетов, где:

- есть группировка или фильтрация по `status`;
- нужна сортировка по `created_at`;
- в select попадают `user_id`, `map_id`, `total_amount`, `id`.

Минус: широкий индекс тяжелее поддерживать на вставках и обновлениях. Его стоит добавлять только под реальные частые запросы.

## Порядок колонок в composite index

Порядок колонок важен из-за leftmost prefix rule.

Хороший индекс для cursor pagination:

```sql
CREATE INDEX idx_reports_orders_created_id
  ON orders (created_at DESC, id DESC);
```

Он совпадает с:

```sql
ORDER BY created_at DESC, id DESC
```

и поддерживает cursor-условие:

```sql
WHERE created_at < ?
   OR (created_at = ? AND id < ?)
```

В reports endpoint для `orders/page` используется:

```sql
FORCE INDEX (idx_reports_orders_created_id)
```

Это сделано как учебный прием: на небольшой или перекошенной выборке MySQL может предпочесть широкий covering index и все равно выполнить `Sort`. `FORCE INDEX` помогает явно сравнить план, где порядок строк читается из composite index. В обычном production-коде принудительный индекс нужно использовать только после замеров на реальных данных.

## Плохой индекс

Антипример:

```sql
CREATE INDEX idx_bad_orders_amount_status
  ON orders (total_amount, status);
```

Почему он плох для отчета:

```sql
SELECT status, COUNT(*)
FROM orders
GROUP BY status;
```

MySQL не может эффективно использовать второй столбец `status`, если первый столбец `total_amount` не ограничен условием `WHERE total_amount = ...` или диапазоном, подходящим плану. Для группировки по `status` лучше начинать индекс со `status`.

Еще один антипример:

```sql
CREATE INDEX idx_bad_orders_id_created
  ON orders (id, created_at);
```

Он плохо помогает запросу:

```sql
ORDER BY created_at DESC, id DESC
```

Потому что сортировка начинается с `created_at`, а индекс начинается с `id`.

## Что фиксировать в выводах

Для каждого сравнения записывай:

- какой запрос проверялся;
- какие индексы были доступны;
- был ли `Sort`;
- был ли `Table scan`;
- сколько строк прочитано;
- `actual time`;
- какой индекс помог и почему.
