# Outbox

## Цель

Outbox реализует доставку доменных событий без брокеров сообщений. Бизнес-операция пишет данные и событие в одну MySQL-транзакцию, а `OutboxPublisher` позднее забирает событие из таблицы `outbox_events`.

Паттерн устраняет dual-write между бизнес-таблицей и публикацией события: после
commit существуют обе записи, после rollback — ни одной. Гарантия обработки при
этом остается **at least once**, поэтому side effects обязаны быть идемпотентными.

## Схема `outbox_events`

| Поле | Назначение |
| --- | --- |
| `id` | Идентификатор и порядок события |
| `event_type` | Например, `order.created` |
| `aggregate_type`, `aggregate_id` | Тип и ID бизнес-агрегата |
| `payload` | JSON-снимок данных обработчика |
| `status` | Состояние жизненного цикла |
| `attempts` | Число неуспешных обработок |
| `next_retry_at` | Когда failed-событие снова становится due |
| `processed_at` | Время успешного завершения |
| `error` | Последняя ошибка, обрезанная worker до 4000 символов |
| `manual_retry_reason` | Audit-причина ручного retry |
| `created_at` | Время создания события |

Основной polling-индекс — `(status, next_retry_at)`, дополнительные индексы
поддерживают поиск по aggregate и времени создания.

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
| `failed` | Обработка завершилась ошибкой, но еще будет retry |
| `dead_letter` | Попытки исчерпаны, нужен ручной разбор |

## Polling

`OutboxPublisher` запускается вместе с Nest-приложением и периодически вызывает `processDueBatch()`.

Один tick выполняет следующие шаги:

1. Не запускается, если предыдущий tick еще работает или начался shutdown.
2. В короткой транзакции выбирает due `pending`/`failed` события.
3. Блокирует строки через `FOR UPDATE SKIP LOCKED`, меняет их на `processing` и
   делает commit.
4. Последовательно передает события в `OutboxService` вне claim-транзакции.
5. Резервирует idempotency key, выполняет handler и фиксирует `processed` либо
   планирует retry/dead letter.
6. Обновляет Prometheus counters, duration и gauge статусов.

Настройки:

| Env | Default приложения | Назначение |
| --- | --- | --- |
| `OUTBOX_POLL_INTERVAL_MS` | `5000` | Интервал polling |
| `OUTBOX_BATCH_SIZE` | `10` | Размер пачки событий |
| `OUTBOX_MAX_ATTEMPTS` | `5` | Максимальное число попыток |
| `OUTBOX_RETRY_BASE_DELAY_MS` | `1000` | Базовая задержка retry |
| `OUTBOX_RETRY_MAX_DELAY_MS` | `60000` | Максимальная задержка retry |
| `OUTBOX_RETRY_JITTER_MS` | `0` | Случайный jitter для retry |
| `OUTBOX_SHUTDOWN_TIMEOUT_MS` | `10000` | Сколько ждать текущий tick при shutdown |

Docker Compose задает более частый polling `1000` мс и jitter `250` мс. Если
переменная не передана приложению вообще, используются defaults из таблицы.

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
min(OUTBOX_RETRY_BASE_DELAY_MS * 2 ^ (attempts - 1), OUTBOX_RETRY_MAX_DELAY_MS)
```

Если задан `OUTBOX_RETRY_JITTER_MS`, к задержке добавляется случайное значение от `0` до `OUTBOX_RETRY_JITTER_MS`, но итоговая задержка не превышает `OUTBOX_RETRY_MAX_DELAY_MS`.

Если достигнут `OUTBOX_MAX_ATTEMPTS`, событие переводится в `dead_letter`, `next_retry_at` становится `NULL`, и автоматический worker больше его не забирает.

## Ручной retry

Endpoint:

```http
POST /outbox/events/:id/retry
```

Body:

```json
{
  "reason": "Исправлена внешняя ошибка генерации media, можно повторить."
}
```

Он сбрасывает:

- `status` в `pending`;
- `attempts` в `0`;
- `next_retry_at`, `processed_at`, `error` в `NULL`.
- `manual_retry_reason` получает переданную причину.

## Idempotency обработчиков

Таблица `processed_events` защищает side effects от повторной генерации.

Ключ строится так:

```text
eventType:aggregateType:aggregateId
```

Например:

```text
order.created:order:123
```

Перед вызовом handler-а `OutboxService` пытается создать reservation со статусом `processing`. Если запись уже есть, повторная генерация media не запускается. После успешного handler-а reservation переводится в `processed`. При ошибке reservation удаляется, чтобы следующий retry мог повторить обработку.

## Обработчики

Сейчас зарегистрирован обработчик `order.created`.

Он:

- читает `orderId`, `userId`, `mapId` из payload;
- генерирует avatar пользователя;
- генерирует QR-code карты.

Новые типы событий нужно подключать через `OutboxService.handleEvent()`.

Неизвестный `event_type` считается ошибкой обработки и проходит обычную retry
policy; после исчерпания попыток он попадет в `dead_letter`.

## Graceful shutdown

При остановке Nest-приложения `OutboxPublisher`:

- останавливает interval polling;
- не начинает новые tick;
- ждет завершения текущего tick до `OUTBOX_SHUTDOWN_TIMEOUT_MS`;
- пишет лог об остановке.

## API наблюдения

```http
GET /outbox/events?status=failed&limit=20&offset=0
GET /outbox/events/:id
POST /outbox/events/:id/retry
```

Ручной retry должен выполняться после устранения причины ошибки. Он не отменяет
уже совершенный внешний side effect; защитой от его повторения служит
`processed_events`.

## Ограничения без брокера

- Polling добавляет задержку до следующего tick и постоянную нагрузку на MySQL.
- Таблица растет; нужна политика retention/архивации обработанных событий.
- Нет broker partitions, consumer groups, встроенного replay и отдельного DLQ UI.
- Ordering гарантируется только выборкой по `created_at`, но параллельные worker’ы
  могут завершить разные события не по порядку.
- Событие, оставшееся в `processing` после аварийного завершения процесса, сейчас
  автоматически не возвращается в `pending`; нужен lease/locked-at recovery job.
- Reservation со статусом `processing`, оставшаяся после crash между side effect
  и финальной отметкой, требует reconciliation. Нельзя доказать атомарность MySQL
  и произвольного внешнего storage одной локальной транзакцией.
- Текущий idempotency key строится без `event.id`; повторное легитимное событие
  того же типа для того же aggregate будет считаться уже обработанным. Для таких
  доменов ключ нужно проектировать по уникальному business operation/event ID.
- MySQL становится одновременно business DB и event transport, поэтому всплеск
  событий конкурирует с API за connections, I/O и locks.

Для учебного приложения это осознанный компромисс. При росте throughput,
требованиях к длительному retention или независимому масштабированию consumers
стоит публиковать Outbox в Kafka/RabbitMQ/NATS через отдельный relay.
