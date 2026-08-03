# HTTP API

## Цель

Документ фиксирует текущий HTTP API. Интерактивная Swagger-документация доступна по адресу `/docs`.

## Формат ошибок

Все ошибки API возвращаются в едином формате:

```json
{
  "statusCode": 400,
  "errorCode": "VALIDATION_ERROR",
  "message": "Ошибка валидации входных данных",
  "path": "/users",
  "method": "POST",
  "timestamp": "2026-08-03T00:00:00.000Z",
  "requestId": "request-id",
  "details": []
}
```

## Health

| Метод | URL | Описание |
| --- | --- | --- |
| `GET` | `/health` | Проверить готовность приложения и MySQL |
| `GET` | `/health/live` | Проверить, что HTTP-процесс приложения жив |

## Общие правила

- Валидация включена глобально через `ValidationPipe`.
- Лишние поля во входных данных запрещены.
- DTO лежат в папках `dto`.
- Каждый DTO расположен в отдельном файле.
- Типы модуля лежат в папках `types`.
- SQL-запросы находятся только в `repositories`.

## Users

| Метод | URL | Назначение |
| --- | --- | --- |
| `POST` | `/users` | Создать пользователя |
| `GET` | `/users` | Получить список пользователей |
| `GET` | `/users/:id` | Получить пользователя по ID |
| `PATCH` | `/users/:id` | Обновить пользователя |
| `DELETE` | `/users/:id` | Удалить пользователя |

DTO:

- `CreateUserDto`
- `UpdateUserDto`
- `ListUsersQueryDto`

Repository:

- `UsersRepository`

## Maps

| Метод | URL | Назначение |
| --- | --- | --- |
| `POST` | `/maps` | Создать карту |
| `GET` | `/maps` | Получить список карт |
| `GET` | `/maps/:id` | Получить карту по ID |
| `PATCH` | `/maps/:id` | Обновить карту |
| `DELETE` | `/maps/:id` | Удалить карту |

DTO:

- `CreateMapDto`
- `UpdateMapDto`
- `ListMapsQueryDto`

Repository:

- `MapsRepository`

## Orders

| Метод | URL | Назначение |
| --- | --- | --- |
| `POST` | `/orders` | Создать заказ и Outbox-событие в одной транзакции |
| `GET` | `/orders` | Получить список заказов |
| `GET` | `/orders/reports/overview` | Получить отчет заказов с JOIN между users, maps и orders |
| `GET` | `/orders/:id` | Получить заказ по ID |
| `PATCH` | `/orders/:id/status` | Изменить статус заказа |
| `GET` | `/orders/users/:userId` | Получить заказы пользователя |
| `GET` | `/orders/maps/:mapId` | Получить заказы по карте |

DTO:

- `CreateOrderDto`
- `UpdateOrderStatusDto`
- `ListOrdersQueryDto`
- `OrderStatus`

Repository:

- `OrdersRepository`

## Outbox

| Метод | URL | Назначение |
| --- | --- | --- |
| `GET` | `/outbox/events` | Получить список Outbox-событий |
| `GET` | `/outbox/events/:id` | Получить Outbox-событие по ID |
| `POST` | `/outbox/events/:id/retry` | Повторно поставить событие в обработку |

DTO:

- `ListOutboxEventsQueryDto`
- `OutboxEventStatus`

Repository:

- `OutboxRepository`

## Media

| Метод | URL | Назначение |
| --- | --- | --- |
| `POST` | `/media/users/:userId/avatar` | Сгенерировать avatar пользователя и сохранить asset |
| `POST` | `/media/maps/:mapId/qr` | Сгенерировать QR-code карты и сохранить asset |
| `GET` | `/media/:id` | Получить media asset по ID |

DTO:

- `GenerateUserAvatarDto`
- `GenerateMapQrDto`

Repository:

- `MediaRepository`

Генераторы:

- `AvatarGenerator`: `@dicebear/core` + `@dicebear/collection`.
- `QrCodeGenerator`: `qrcode`.

## Swagger

Swagger подключен в `main.ts` через `SwaggerModule.setup('docs', app, swaggerDocument)`.

Локальный URL:

```text
http://localhost:3000/docs
```
