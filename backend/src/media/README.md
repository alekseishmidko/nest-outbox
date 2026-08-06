# Media Module

## Цель

Модуль `media` отвечает за генерацию QR-code и avatar-контента, а также за сохранение результата в `media_assets`.

## Структура

- `controllers`: HTTP endpoints для генерации и получения медиа.
- `services`: генерация и сохранение медиа.
- `repositories`: raw SQL-запросы к `media_assets`, `users`, `maps`.
- `generators`: адаптеры библиотек генерации.
- `storage`: адаптеры хранения `database`, `local-file`, `s3-compatible`.
- `dto`: входные DTO.
- `types`: типы строк БД и результатов генерации.

## Основные задачи

- Генерация QR-code для карты.
- Генерация avatar для пользователя.
- Возврат медиа в `base64`, `dataUrl` или другом формате.
- Сохранение результата генерации.
- Переключение storage backend через `MEDIA_STORAGE_MODE`.
- Связь с Outbox через обработчик `order.created`.

## Библиотеки

- `qrcode`: QR-code в формате PNG `dataUrl`.
- `@dicebear/core` и `@dicebear/collection`: SVG avatar в стиле `identicon`.

## Storage modes

- `database`: хранит base64 в `media_assets.content_base64`.
- `local-file`: пишет файл в `MEDIA_LOCAL_STORAGE_DIR`, в БД хранит путь и metadata.
- `s3-compatible`: загружает объект в MinIO/S3-compatible bucket, в БД хранит object key и metadata.

Controller слой не знает, какой storage backend выбран. HTTP API вызывает только `MediaService`, а детали хранения инкапсулированы в `MediaStorageService`.

## SQL-фокус

- Хранение JSON metadata.
- Выборка медиа по `owner_type` и `owner_id`.
