# Common Layer

## Цель

`common` содержит переиспользуемую инфраструктуру приложения, которая не принадлежит конкретному доменному модулю.

## Планируемая структура

- `filters`: глобальные exception filters.
- `guards`: guards для доступа.
- `interceptors`: interceptors для логирования, метрик и request id.
- `pipes`: общие pipes.
- `utils`: небольшие утилиты без бизнес-логики.

## Правила

- Не размещать здесь бизнес-логику.
- Не размещать SQL-запросы.
- Не превращать `common` в склад случайного кода.

## Единый формат ошибок API

Все HTTP-ошибки проходят через `ApiExceptionFilter` и возвращаются в формате:

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

`requestId` берется из `x-request-id` или генерируется request logger. Неожиданные ошибки логируются как `500`, но stack trace не отдается клиенту.

## Валидация DTO

Глобальный `ValidationPipe` создается через `createApiValidationPipe`:

- `whitelist: true` удаляет неизвестные поля.
- `forbidNonWhitelisted: true` возвращает ошибку при лишних полях.
- `transform: true` применяет DTO-преобразования.
- `enableImplicitConversion: false` требует явного `@Type`.
