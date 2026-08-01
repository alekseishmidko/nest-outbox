# Metrics Module

## Цель

Модуль `metrics` отвечает за сбор и экспорт метрик приложения в формате Prometheus.

## Структура

- `controllers`: endpoint `/metrics`.
- `services`: регистрация и обновление метрик.
- `collectors`: HTTP, DB и Outbox collectors.
- `interceptors`: сбор HTTP latency и request count.

## Основные задачи

- Экспортировать endpoint `/metrics`.
- Собирать HTTP latency и request count.
- Собирать метрики Outbox: processed, failed, duration, статусы.
- Собирать длительность MySQL `query` и `execute`.
- Отдавать default Node.js process metrics через `prom-client`.

## Основные метрики

- `http_requests_total`
- `http_request_duration_seconds`
- `outbox_processed_total`
- `outbox_failed_total`
- `outbox_processing_duration_seconds`
- `outbox_events_by_status`
- `db_query_duration_seconds`

## Observability-фокус

- Prometheus metrics.
- Grafana dashboards.
- Latency p50/p95/p99.
