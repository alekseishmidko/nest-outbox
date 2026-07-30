# Outbox

## Цель

Outbox реализует доставку доменных событий без брокеров сообщений. Бизнес-операция пишет данные и событие в одну MySQL-транзакцию, а `OutboxPublisher` позднее забирает событие из таблицы `outbox_events`.

## Создание заказа

`OrdersRepository.createWithOutbox()` делает две записи в одной транзакции:

- `orders`: новый заказ со статусом `pending`;
- `outbox_events`: событие `order.created`.

Если вставка в `outbox_events` падает, выполняется `ROLLBACK`, и заказ не сохраняется.

## Статусы

| Статус | Значение |
| --- | --- |
| `pending` | Событие готово к обработке |
| `processing` | Событие забрано worker и сейчас обрабатывается |
| `processed` | Событие успешно обработано |
| `failed` | Обработка завершилась ошибкой |

## Polling

`OutboxPublisher` запускается вместе с Nest-приложением и периодически вызывает `processDueBatch()`.

Настройки:

| Env | По умолчанию | Назначение |
| --- | --- | --- |
| `OUTBOX_POLL_INTERVAL_MS` | `5000` | Интервал polling |
| `OUTBOX_BATCH_SIZE` | `10` | Размер пачки событий |
| `OUTBOX_MAX_ATTEMPTS` | `5` | Максимальное число попыток |
| `OUTBOX_RETRY_BASE_DELAY_MS` | `1000` | Базовая задержка retry |

## Блокировка

События забираются в транзакции через:

```sql
SELECT ...
FROM outbox_events
WHERE ...
ORDER BY created_at ASC
LIMIT ?
FOR UPDATE SKIP LOCKED;
```

Зачем это нужно:

- `FOR UPDATE` блокирует выбранные строки до конца транзакции;
- `SKIP LOCKED` позволяет другому инстансу приложения пропустить уже заблокированные строки;
- после claim выбранные события переводятся в `processing`.

Так несколько backend-инстансов могут работать параллельно и не обрабатывать одно событие дважды.

## Retry

При ошибке обработки:

- `attempts` увеличивается на `1`;
- `status` становится `failed`;
- `error` сохраняет текст ошибки;
- `next_retry_at` получает время следующей попытки.

Задержка считается экспоненциально:

```text
OUTBOX_RETRY_BASE_DELAY_MS * 2 ^ (attempts - 1)
```

Если достигнут `OUTBOX_MAX_ATTEMPTS`, `next_retry_at` становится `NULL`, и событие остается в `failed` до ручного retry.

## Ручной retry

Endpoint:

```http
POST /outbox/events/:id/retry
```

Он сбрасывает:

- `status` в `pending`;
- `attempts` в `0`;
- `next_retry_at`, `processed_at`, `error` в `NULL`.

## Обработчики

Сейчас зарегистрирован обработчик `order.created`.

Он:

- читает `orderId`, `userId`, `mapId` из payload;
- генерирует avatar пользователя;
- генерирует QR-code карты.

Новые типы событий нужно подключать через `OutboxService.handleEvent()`.
