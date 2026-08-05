# Нагрузочное тестирование

## Цель

Нагрузочные тесты нужны, чтобы проверять живость API, устойчивость приложения под стабильной нагрузкой и пределы системы при росте конкуренции.

В проекте выбран `k6`, потому что сценарии пишутся на JavaScript, легко запускаются локально и хорошо показывают RPS, latency p95/p99 и error rate прямо в CLI.

## Сценарии

Файлы находятся в `load-tests`:

- `smoke.js` - один короткий бизнес-флоу для проверки, что API живой.
- `load.js` - стабильная нагрузка несколько минут.
- `stress.js` - ступенчатый рост нагрузки для поиска предела.
- `pagination-compare.js` - сравнение offset и cursor pagination.
- `helpers.js` - общие HTTP-запросы и бизнес-флоу.

Каждая итерация выполняет:

- создание пользователя;
- создание карты;
- создание заказа;
- генерацию avatar;
- генерацию QR-code;
- чтение списков;
- чтение отчета `GET /orders/reports/overview` с `JOIN` между `orders`, `users` и `maps`.
- чтение отчета `GET /users/:id/activity` в режимах `offset` и `cursor`.

## Запуск

Перед запуском подними окружение:

```bash
bun run docker:local
```

Быстрая проверка:

```bash
bun run load:smoke
```

Стабильная нагрузка:

```bash
bun run load:load
```

Stress-тест:

```bash
bun run load:stress
```

Сравнение offset и cursor pagination:

```bash
bun run load:pagination
```

Если `k6` установлен локально, можно запускать без Docker:

```bash
BASE_URL=http://localhost:3000 k6 run load-tests/smoke.js
BASE_URL=http://localhost:3000 k6 run load-tests/load.js
BASE_URL=http://localhost:3000 k6 run load-tests/stress.js
```

## Метрики результата

В CLI k6 смотри:

- `http_reqs` - общее количество запросов и RPS;
- `http_req_duration` - latency, особенно `p(95)` и `p(99)`;
- `http_req_failed` - доля HTTP-ошибок;
- `api_error_rate` - кастомная доля неожиданных статусов API;
- `business_flow_duration` - длительность отдельных HTTP-шагов бизнес-флоу.

В Grafana смотри dashboard `Nest Outbox Observability`:

- HTTP RPS;
- latency p50/p95/p99;
- error rate;
- Outbox pending/failed/processed;
- DB query duration.

## Сравнение offset и cursor

Сценарий `pagination-compare.js` тегирует запросы:

- `user_activity_offset`;
- `user_activity_cursor`;
- `user_activity_cursor_next`.

В k6 CLI сравни `http_req_duration` по этим тегам. В Grafana сравни p95/p99 endpoint’ов, если метрики собраны после запуска сценария.

Ожидаемое поведение:

- На первой странице разница может быть небольшой.
- При росте глубины страниц `offset` деградирует, потому что БД должна пропустить предыдущие строки.
- Cursor pagination остается стабильнее, потому что условие использует `(created_at, id)` и индекс `idx_orders_user_created_id`.

### Локальный прогон 2026-08-05

Команда:

```bash
bun run load:pagination
```

Результат:

- iterations: `390`;
- HTTP requests: `3900`;
- RPS: `38.83/s`;
- error rate: `0%`;
- overall p95: `14.38ms`;
- `user_activity_cursor` p95: `5.99ms`;
- `user_activity_offset` p95: `7.64ms`.

Вывод по этому небольшому профилю: обе стратегии быстрые на первых страницах, cursor уже немного стабильнее. Для демонстрации деградации offset нужно отдельно запускать сценарий с глубокими страницами и большим объемом заказов на одного пользователя.

## Шаблон фиксации результатов

```markdown
## Результат load/stress теста

- Дата:
- Окружение:
- Команда:
- Длительность:
- VUs:
- RPS:
- Latency p95:
- Latency p99:
- Error rate:
- Узкие места:
- SQL-запросы, которые оптимизировались:
- Решения:
- Повторный результат после оптимизации:
```

## SQL для анализа

Основной read-сценарий нагрузки:

```sql
EXPLAIN ANALYZE
SELECT
  o.id AS order_id,
  o.status,
  o.total_amount,
  o.created_at,
  u.id AS user_id,
  u.email AS user_email,
  u.name AS user_name,
  m.id AS map_id,
  m.title AS map_title,
  m.latitude,
  m.longitude
FROM orders o
JOIN users u ON u.id = o.user_id
JOIN maps m ON m.id = o.map_id
ORDER BY o.created_at DESC
LIMIT 20 OFFSET 0;
```

Если p95 растет, сначала проверяй:

- используется ли индекс `orders.status` при фильтре по статусу;
- насколько дорогой `ORDER BY o.created_at DESC`;
- нужен ли дополнительный индекс под частый отчет, например `(status, created_at)`;
- не создает ли генерация QR/avatar слишком большую нагрузку на CPU;
- не задерживает ли Outbox worker основные HTTP-запросы.
