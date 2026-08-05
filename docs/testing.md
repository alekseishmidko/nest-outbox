# Тестирование

## Уровни тестов

Проект использует несколько уровней проверки.

## Unit tests

Unit-тесты проверяют сервисы, handlers, workers и repository-маппинг без реальной БД.

```bash
bun run test
```

Покрываемые сервисы:

- `users`;
- `maps`;
- `orders`;
- `media`;
- `outbox`.

## Integration tests repositories

Integration-тесты проверяют реальные SQL-запросы на отдельной тестовой MySQL БД.

```bash
RUN_INTEGRATION_TESTS=true bun run test:integration
```

Переменные по умолчанию:

- `TEST_MYSQL_HOST=127.0.0.1`
- `TEST_MYSQL_PORT=3306`
- `TEST_MYSQL_ROOT_USER=root`
- `TEST_MYSQL_ROOT_PASSWORD=root_password`

Тестовый helper создает отдельную БД, применяет SQL-миграцию `001_create_core_tables.sql`, чистит таблицы между тестами и удаляет БД после завершения.

## E2E tests API

E2E-тесты поднимают Nest-приложение через `AppModule` и проверяют HTTP API:

- создание пользователя;
- создание карты;
- создание заказа;
- генерацию avatar;
- генерацию QR-code;
- обработку Outbox;
- единый формат ошибки валидации.

```bash
RUN_E2E_TESTS=true bun run test:e2e
```

## Тесты транзакций

Транзакционный integration-тест явно открывает транзакцию, создает заказ, провоцирует ошибку вставки Outbox-события и проверяет, что заказ не сохраняется.

Это фиксирует ключевой критерий Outbox: если событие не записалось, бизнес-запись тоже откатывается.

## Performance tests

Performance-тесты фиксируют допустимое время выполнения критичных SQL-запросов.

```bash
RUN_PERFORMANCE_TESTS=true bun run test:performance
```

Текущий критичный запрос:

- `ordersRepository.findOverview` - JOIN между `orders`, `users`, `maps`.
- `usersRepository.findActivity` - сложный JOIN `users -> orders -> maps -> media_assets`.

Порог по умолчанию:

```bash
PERFORMANCE_JOIN_OVERVIEW_MAX_MS=100
PERFORMANCE_USER_ACTIVITY_MAX_MS=100
```

Порог можно менять под конкретное окружение CI/local. Если тест начинает падать, нужно смотреть `EXPLAIN ANALYZE`, индексы и p95 в Grafana.
