# Нагрузочное тестирование

## Цель

Нагрузочные тесты нужны, чтобы проверять живость API, устойчивость приложения под стабильной нагрузкой и пределы системы при росте конкуренции.

В проекте выбран `k6`, потому что сценарии пишутся на JavaScript, легко запускаются локально и хорошо показывают RPS, latency p95/p99 и error rate прямо в CLI.

## Сценарии

Файлы находятся в `load-tests`:

- `smoke.js` - один короткий бизнес-флоу для проверки, что API живой.
- `load.js` - стабильная нагрузка несколько минут.
- `stress.js` - ступенчатый рост нагрузки для поиска предела.
- `helpers.js` - общие HTTP-запросы и бизнес-флоу.

Каждая итерация выполняет:

- создание пользователя;
- создание карты;
- создание заказа;
- генерацию avatar;
- генерацию QR-code;
- чтение списков;
- чтение отчета `GET /orders/reports/overview` с `JOIN` между `orders`, `users` и `maps`.

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
