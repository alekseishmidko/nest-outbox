# Observability: логи, метрики, Prometheus и Grafana

## Цель и поток данных

Observability в проекте отвечает на четыре вопроса: какой запрос выполнялся,
где возникла ошибка, сколько заняла операция и меняется ли состояние системы со
временем.

```text
HTTP / worker
  ├─ JSON logs → stdout → docker logs
  └─ prom-client registry → GET /metrics
                              ↓ scrape каждые 15 секунд
                           Prometheus
                              ↓ PromQL
                            Grafana
```

Логи не отправляются во внешнее хранилище: сейчас их источником остается stdout
контейнера. Prometheus хранит числовые временные ряды, а Grafana читает их через
provisioned datasource.

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

Pino также добавляет стандартные поля запроса/ответа и `responseTime`. Секретные
поля `authorization`, `cookie` и `body.password` удаляются конфигурацией
redaction. Новые секреты необходимо явно добавлять в список redaction.

Пример запроса с идентификатором, пригодным для сквозного поиска:

```bash
curl -H 'x-request-id: debug-order-42' http://localhost:3000/orders/42
```

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

Дополнительные события:

| Событие | Назначение | Ключевые поля |
| --- | --- | --- |
| `outbox.event_processing_started` | Начало обработки | `correlationId`, `outboxEventId`, `attempts` |
| `outbox.event_processed` | Успешная обработка | `correlationId`, `durationSeconds` |
| `outbox.order_created.handle` | Запуск бизнес-обработчика | данные aggregate/event |
| `route.search_completed` | Завершение route search | `strategy`, обе карты, distance, число кандидатов |
| transaction retry | Deadlock retry заказа | `transactionId`, `requestId`, `attempt`, `errorCode`, `outcome` |

`transactionId` остается одинаковым между retry-попытками, поэтому по нему
виден полный жизненный цикл транзакции. `outcome` принимает `retrying`, `success`
или `failed`.

Slow query logging:

| Переменная | Назначение | Значение по умолчанию |
| --- | --- | --- |
| `SQL_SLOW_QUERY_THRESHOLD_MS` | Порог записи `db.slow_query` | `100` |

Просмотр локальных логов:

```bash
docker compose --env-file .env.local \
  -f docker/docker-compose.local.yml logs -f backend
```

В production JSON-логи следует собирать централизованно, например через Loki,
OpenSearch или другой log backend. Сам проект такой backend пока не поднимает.

## Метрики приложения

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
| `route_search_total` | Число route search по `strategy` и `result` |
| `route_search_duration_seconds` | Latency route search по `strategy` и `result` |

Также экспортируются default Node.js process metrics с префиксом `nest_outbox_`.

`operation` определяется по repository call stack, например `UsersRepository.findAll`.
`command` показывает источник выполнения: `pool.query`, `pool.execute`, `connection.query` или `connection.execute`.

Для histogram используются серии `_bucket`, `_sum` и `_count`. Percentile нельзя
получать усреднением уже рассчитанных percentiles: сначала нужно суммировать
bucket по нужным labels, затем применять `histogram_quantile`.

Проверка endpoint без Prometheus:

```bash
curl http://localhost:3000/metrics
```

## Prometheus

### Правила alerting

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

Prometheus только вычисляет эти правила и показывает их на странице `/alerts`.
Alertmanager и каналы доставки уведомлений в Compose не настроены, поэтому email,
Slack или PagerDuty автоматически не получат alert.

### Scrape и PromQL

Конфигурация находится в
`docker/prometheus/prometheus.yml`. Prometheus обращается к
`backend:3000/metrics` каждые 15 секунд; это имя доступно внутри Docker network.

Локальный запуск и проверка:

```bash
docker compose --env-file .env.local \
  -f docker/docker-compose.local.yml up -d backend prometheus grafana

curl http://localhost:9090/-/healthy
```

UI доступен на `http://localhost:9090`. В `Status → Targets` target `backend`
должен иметь состояние `UP`.

Полезные PromQL-запросы:

```promql
# RPS по route
sum(rate(http_requests_total[5m])) by (method, route)

# HTTP p95
histogram_quantile(
  0.95,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route)
)

# DB p95 по repository operation
histogram_quantile(
  0.95,
  sum(rate(db_query_duration_seconds_bucket[5m])) by (le, operation)
)

# Route search p95
histogram_quantile(
  0.95,
  sum(rate(route_search_duration_seconds_bucket[5m])) by (le, strategy, result)
)

# Текущие dead-letter события
outbox_events_by_status{status="dead_letter"}
```

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

Локальные credentials по умолчанию: `admin` / `admin`. Они задаются через
`GRAFANA_ADMIN_USER` и `GRAFANA_ADMIN_PASSWORD`; production должен использовать
собственный пароль. Datasource `Prometheus` provisioned с URL
`http://prometheus:9090`, dashboard загружается из JSON автоматически.

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

Route-метрики экспортируются backend, но отдельные панели для них пока не
добавлены в provisioned dashboard. Их можно проверить через Explore и PromQL из
раздела выше.

## Диагностика

Если dashboard пустой:

1. Проверить `curl http://localhost:3000/metrics`.
2. Проверить target `backend` на `http://localhost:9090/targets`.
3. Выполнить `up`-запрос в Prometheus; значение должно быть `1`.
4. Проверить datasource в Grafana и Docker-логи трех сервисов.
5. Создать реальный HTTP/Outbox/route трафик — counters и histogram появляются
   только после наблюдаемой операции.

Если `requestId` есть в HTTP-логе, но отсутствует в SQL-логе, SQL мог выполняться
вне HTTP `AsyncLocalStorage` context, например из CLI-команды. Для фонового
Outbox используется отдельный `correlationId`.

## Ограничения

- Нет централизованного log storage и поиска по истории.
- Нет distributed tracing и trace/span IDs.
- Нет Alertmanager и доставки alerts.
- Нет container exporter для CPU/RAM контейнеров.
- Prometheus labels должны оставаться низкокардинальными: нельзя добавлять в них
  `requestId`, `transactionId`, SQL-текст, email или идентификаторы сущностей.
