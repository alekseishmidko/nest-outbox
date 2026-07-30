# Media Module

## Цель

Модуль `media` отвечает за генерацию QR-code и avatar-контента, а также за сохранение результата в `media_assets`.

## Структура

- `controllers`: HTTP endpoints для генерации и получения медиа.
- `services`: генерация и сохранение медиа.
- `repositories`: raw SQL-запросы к `media_assets`, `users`, `maps`.
- `generators`: адаптеры библиотек генерации.
- `dto`: входные DTO.
- `types`: типы строк БД и результатов генерации.

## Основные задачи

- Генерация QR-code для карты.
- Генерация avatar для пользователя.
- Возврат медиа в `base64`, `dataUrl` или другом формате.
- Сохранение результата генерации.
- Связь с Outbox через обработчик `order.created`.

## Библиотеки

- `qrcode`: QR-code в формате PNG `dataUrl`.
- `@dicebear/core` и `@dicebear/collection`: SVG avatar в стиле `identicon`.

## SQL-фокус

- Хранение JSON metadata.
- Выборка медиа по `owner_type` и `owner_id`.
