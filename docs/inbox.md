# Inbox pattern

## Цель

Inbox хранит входящие события до обработки и гарантирует, что повторная доставка
одного `event_id` не создаст вторую бизнес-операцию. Это особенно важно для
webhook и интеграций, где отправитель повторяет запрос после timeout.

## Схема

Таблица `inbox_events` создается миграцией
`009_create_inbox_events.sql` и содержит:

- `event_id` — внешний уникальный идентификатор события;
- `event_type` — тип события и ключ выбора обработчика;
- `payload` — JSON payload;
- `status` — `received`, `processing`, `processed`, `failed`, `dead_letter`;
- `attempts`, `next_retry_at`, `last_error`;
- `created_at`, `updated_at`, `processed_at`.

Уникальный индекс `uq_inbox_events_event_id` делает прием идемпотентным.

## Алгоритм

1. HTTP endpoint `POST /inbox/events` принимает `eventId`, `eventType` и payload.
2. `INSERT IGNORE` сохраняет событие или возвращает уже существующую запись.
3. Worker выбирает `received` и due-`failed` события.
4. `SELECT ... FOR UPDATE SKIP LOCKED` и транзакционный `UPDATE` атомарно
   переводят строки в `processing`.
5. Обработчик типа события выполняет side effect.
6. При успехе запись получает `processed`.
7. При ошибке планируется retry с exponential backoff.
8. После `INBOX_MAX_ATTEMPTS` запись переводится в `dead_letter`.

## Конфигурация

```dotenv
INBOX_POLL_INTERVAL_MS=5000
INBOX_BATCH_SIZE=10
INBOX_MAX_ATTEMPTS=5
INBOX_RETRY_BASE_DELAY_MS=1000
INBOX_RETRY_MAX_DELAY_MS=60000
```

Обработчик регистрируется в `InboxService` по `eventType`:

```ts
inboxService.registerHandler('payment.completed', async (event) => {
  // идемпотентная бизнес-операция
});
```

## Метрики

- `inbox_processed_total{event_type}` — успешно обработанные события;
- `inbox_failed_total{event_type}` — ошибки и попытки retry/dead-letter;
- `inbox_lag_seconds{event_type}` — задержка от приема до обработки.

## Ограничения

- Inbox не заменяет транзакцию бизнес-операции и не делает внешний side effect
  атомарным с записью в MySQL.
- Обработчики должны быть идемпотентными; для внешних систем нужен отдельный
  idempotency key или provider-side deduplication.
- Без брокера polling создает задержку и нагрузку на MySQL.
- `dead_letter` требует ручного анализа и повторного запуска отдельной операцией.
- `FOR UPDATE SKIP LOCKED` требует InnoDB и поддерживаемой версии MySQL.

## Проверка

Integration-тесты проверяют:

- повторную доставку одного `event_id`;
- конкурентный claim двумя worker-ами.

```bash
RUN_INTEGRATION_TESTS=true npm run test:integration
```
