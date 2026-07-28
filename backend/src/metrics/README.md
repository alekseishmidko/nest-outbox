# Metrics Module

## Цель

Модуль `metrics` отвечает за сбор и экспорт метрик приложения в формате Prometheus.

## Планируемая структура

- `controllers`: endpoint `/metrics`.
- `services`: регистрация и обновление метрик.
- `collectors`: HTTP, DB и Outbox collectors.

## Основные задачи

- Экспортировать endpoint `/metrics`.
- Собирать HTTP latency и request count.
- Собирать метрики Outbox.
- Собирать метрики ошибок.

## Observability-фокус

- Prometheus metrics.
- Grafana dashboards.
- Latency p50/p95/p99.
