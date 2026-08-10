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
- Dead-letter после исчерпания попыток.
- Idempotency key обработчиков через `processed_events`.
- Метрики по processed/failed/pending.

## Runtime-поведение

- `OutboxPublisher` стартует вместе с Nest-приложением.
- За один tick worker забирает пачку событий через `FOR UPDATE SKIP LOCKED`.
- Успешное событие переводится в `processed`.
- Ошибка переводит событие в `failed`, увеличивает `attempts` и заполняет `next_retry_at`.
- После `OUTBOX_MAX_ATTEMPTS` событие переводится в `dead_letter`.
- Перед side effect обработчик резервирует ключ вида `eventType:aggregateType:aggregateId` в `processed_events`.
- При shutdown worker прекращает polling и ждет завершения текущего tick.

## Retry policy

Backoff считается экспоненциально:

```text
min(OUTBOX_RETRY_BASE_DELAY_MS * 2 ^ (attempts - 1), OUTBOX_RETRY_MAX_DELAY_MS)
```

`OUTBOX_RETRY_JITTER_MS` добавляет случайный jitter и также ограничивается `OUTBOX_RETRY_MAX_DELAY_MS`.

Если `attempts >= OUTBOX_MAX_ATTEMPTS`, событие получает статус `dead_letter`. Вернуть его в обработку можно через manual retry с причиной.

## SQL-фокус

- Транзакции.
- Row-level locks.
- Индексы по `status` и `next_retry_at`.
- Уникальный ключ `processed_events.idempotency_key`.
