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

Режим выбирается через `MEDIA_STORAGE_MODE`.

### `database`

```env
MEDIA_STORAGE_MODE=database
```

- `content_base64`: base64-представление SVG или PNG.
- `file_path`: `NULL`.
- `metadata`: JSON с технической информацией генерации.

Подходит для учебного старта и простых проверок через Adminer. Минус: БД быстро растет, а большие ответы тяжелее читать.

### `local-file`

```env
MEDIA_STORAGE_MODE=local-file
MEDIA_LOCAL_STORAGE_DIR=/app/storage/media
MEDIA_PUBLIC_BASE_URL=http://localhost:9000/media-assets
```

- `content_base64`: `NULL`.
- `file_path`: путь до файла внутри контейнера.
- `metadata.objectKey`: относительный ключ объекта.
- `metadata.publicUrl`: публичный URL, если задан `MEDIA_PUBLIC_BASE_URL`.

В Docker Compose каталог `/app/storage/media` вынесен в отдельный volume.

### `s3-compatible`

```env
MEDIA_STORAGE_MODE=s3-compatible
S3_ENDPOINT=http://minio:9000
S3_REGION=us-east-1
S3_BUCKET=media-assets
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_FORCE_PATH_STYLE=true
```

- `content_base64`: `NULL`.
- `file_path`: object key в bucket.
- `storage_type`: `external`.
- `metadata.bucket`: bucket.
- `metadata.objectKey`: object key.
- `metadata.endpoint`: S3-compatible endpoint.

Для local/prod Docker Compose добавлен MinIO. Bucket создает сервис `minio-init`.

HTTP/controller слой не выбирает storage backend и не знает деталей записи файла или S3 object. Контроллер вызывает только `MediaService`, а выбор backend инкапсулирован в `MediaStorageService`.

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
- `dataUrl`: готовый `data:image/svg+xml;base64,...`, сформированный из результата генерации независимо от storage mode.

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
- `dataUrl`: готовый `data:image/png;base64,...`, сформированный из результата генерации независимо от storage mode.

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
