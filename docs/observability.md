# Observability

## Логирование

Структурное логирование подключено через `nestjs-pino`.

Настройки:

- `LOG_LEVEL`: уровень логов, например `debug`, `info`, `warn`, `error`.
- `x-request-id`: если заголовок передан клиентом, он используется как request id.
- если `x-request-id` не передан, backend генерирует UUID.

Request logging пишет:

- method;
- url;
- status code;
- latency;
- request id.

SQL logs получают тот же `requestId` через `AsyncLocalStorage`, поэтому медленные SQL-запросы можно связать с HTTP-запросом.

Для Outbox используется `correlationId` формата:

```text
outbox:{eventType}:{aggregateType}:{aggregateId}:event:{eventId}
```

Он попадает в логи обработки события и SQL-логи, которые выполняются внутри worker.

Structured error logs стандартизированы через JSON-события:

- `api.error`: необработанная API-ошибка;
- `db.query_error`: ошибка SQL-запроса;
- `db.slow_query`: SQL-запрос дольше порога;
- `outbox.event_failed`: ошибка обработки Outbox-события.

Slow query logging:

| Переменная | Назначение | Значение по умолчанию |
| --- | --- | --- |
| `SQL_SLOW_QUERY_THRESHOLD_MS` | Порог записи `db.slow_query` | `100` |

## Prometheus

Endpoint:

```text
GET /metrics
```

Основные метрики:

| Метрика | Назначение |
| --- | --- |
| `http_requests_total` | Количество HTTP-запросов |
| `http_request_duration_seconds` | HTTP latency |
| `outbox_processed_total` | Успешно обработанные Outbox-события |
| `outbox_failed_total` | Ошибки обработки Outbox-событий |
| `outbox_processing_duration_seconds` | Длительность обработки Outbox-событий |
| `outbox_events_by_status` | Количество событий по статусам |
| `db_query_duration_seconds` | Длительность MySQL-запросов с labels `operation` и `command` |

Также экспортируются default Node.js process metrics с префиксом `nest_outbox_`.

`operation` определяется по repository call stack, например `UsersRepository.findAll`.
`command` показывает источник выполнения: `pool.query`, `pool.execute`, `connection.query` или `connection.execute`.

## Alerting Rules

Prometheus загружает правила из:

```text
docker/prometheus/alerts.yml
```

Правила:

- `HighHttpErrorRate`: доля 5xx выше 5%;
- `HighHttpP95Latency`: HTTP p95 latency выше 1 секунды;
- `HighDbP95Latency`: DB p95 latency по operation выше 250ms;
- `OutboxFailedEvents`: есть ошибки обработки Outbox;
- `OutboxDeadLetterEvents`: есть события в `dead_letter`.

## Grafana

Grafana подключена в Docker Compose.

Локальный URL:

```text
http://localhost:3001
```

Dashboard:

```text
Nest Outbox / Nest Outbox Observability
```

Панели:

- HTTP RPS;
- HTTP latency p50/p95/p99;
- HTTP error rate;
- Outbox by status;
- Outbox throughput;
- Outbox processing duration;
- DB query duration p95 by operation;
- DB queries per operation.

CPU/RAM контейнеров пока не добавлены в dashboard, потому что в инфраструктуре нет container exporter вроде cAdvisor.
