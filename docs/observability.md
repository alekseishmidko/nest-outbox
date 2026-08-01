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
| `db_query_duration_seconds` | Длительность MySQL `query` и `execute` |

Также экспортируются default Node.js process metrics с префиксом `nest_outbox_`.

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
- DB query duration.

CPU/RAM контейнеров пока не добавлены в dashboard, потому что в инфраструктуре нет container exporter вроде cAdvisor.
