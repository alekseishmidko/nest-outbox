# Media

## Цель

Модуль `media` изолирует генерацию и хранение медиа-контента. Сейчас он отвечает за QR-code для `maps` и avatar для `users`.

## Библиотеки

- `qrcode`: генерация PNG QR-code в формате `dataUrl`.
- `@dicebear/core`: генерация avatar.
- `@dicebear/collection`: набор стилей DiceBear, в проекте используется `identicon`.

## Структура

- `controllers`: HTTP API для генерации и получения media asset.
- `services`: бизнес-логика генерации, подготовка payload и сохранение результата.
- `repositories`: raw SQL для `media_assets`, `users`, `maps`.
- `generators`: адаптеры над внешними библиотеками генерации.
- `dto`: входные DTO для Swagger и runtime-валидации.
- `types`: типы строк БД и прикладных результатов.

## Хранение

Результат генерации сохраняется в таблицу `media_assets`.

Для текущего этапа используется `storage_type = database`:

- `content_base64`: base64-представление SVG или PNG.
- `file_path`: `NULL`.
- `metadata`: JSON с технической информацией генерации.

В будущем можно добавить `storage_type = file` или `storage_type = external`, не меняя внешний API модуля.

## API

### POST `/media/users/:userId/avatar`

Генерирует avatar для пользователя и сохраняет asset.

Тело запроса:

```json
{
  "seed": "custom-avatar-seed"
}
```

Если `seed` не передан, используется `users.avatar_seed`.

Ответ содержит:

- `asset`: сохраненная запись `media_assets`.
- `dataUrl`: готовый `data:image/svg+xml;base64,...`.

### POST `/media/maps/:mapId/qr`

Генерирует QR-code для карты и сохраняет asset.

Тело запроса:

```json
{
  "url": "https://example.com/maps/1"
}
```

Также можно передать произвольный payload:

```json
{
  "payload": "{\"mapId\":1,\"source\":\"manual\"}"
}
```

Приоритет входных данных:

1. `url`
2. `payload`
3. payload по умолчанию из данных карты

Ответ содержит:

- `asset`: сохраненная запись `media_assets`.
- `dataUrl`: готовый `data:image/png;base64,...`.

### GET `/media/:id`

Возвращает сохраненный media asset по ID.

## Связь с Outbox

При создании заказа `OrdersRepository.createWithOutbox()` создает заказ и событие `order.created` в одной транзакции.

Для события `order.created` добавлен обработчик `OrderCreatedOutboxHandler`. Он:

- читает `orderId`, `userId`, `mapId` из payload события;
- генерирует avatar для пользователя;
- генерирует QR-code для карты с payload события.

На текущем этапе `OutboxService.handleEvent()` уже маршрутизирует событие в handler. Полноценный polling worker будет добавлен отдельным шагом в разделе Outbox.

## Примеры

Сгенерировать avatar:

```bash
curl -X POST http://localhost:3000/media/users/1/avatar \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Сгенерировать QR-code:

```bash
curl -X POST http://localhost:3000/media/maps/1/qr \
  -H 'Content-Type: application/json' \
  -d '{"payload":"training-map-1"}'
```

Получить asset:

```bash
curl http://localhost:3000/media/1
```
