# Outbox Module

## Цель

Модуль `outbox` реализует паттерн Outbox без брокеров. События сохраняются в таблицу `outbox_events`, а worker периодически читает и обрабатывает их.

## Структура

- `controllers`: endpoints для диагностики и ручного retry.
- `services`: регистрация и обработка событий.
- `repositories`: raw SQL-запросы к `outbox_events`.
- `workers`: polling и retry.
- `handlers`: обработчики конкретных типов событий.
- `dto`: входные DTO для административных endpoints.

## Основные задачи

- Запись Outbox-события внутри бизнес-транзакции.
- Polling событий со статусом `pending`.
- Блокировка событий через `FOR UPDATE SKIP LOCKED`.
- Retry после ошибок.
- Метрики по processed/failed/pending.

## Runtime-поведение

- `OutboxPublisher` стартует вместе с Nest-приложением.
- За один tick worker забирает пачку событий через `FOR UPDATE SKIP LOCKED`.
- Успешное событие переводится в `processed`.
- Ошибка переводит событие в `failed`, увеличивает `attempts` и заполняет `next_retry_at`.

## SQL-фокус

- Транзакции.
- Row-level locks.
- Индексы по `status` и `next_retry_at`.
