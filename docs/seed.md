# Seed и миграции

## Цель

Seed-команды создают тестовые данные для тренировки SQL-запросов, API, Outbox и будущих нагрузочных тестов.

## Команды

Применить новые миграции:

```bash
bun run db:migrate
```

Сбросить таблицы приложения и применить миграции заново:

```bash
bun run db:reset
```

Заполнить БД тестовыми данными:

```bash
bun run db:seed
```

## Что создает seed

По умолчанию:

- `100` пользователей;
- `100` карт;
- `1000` заказов;
- `200` Outbox-событий.

## Настройка объемов

Количество записей можно менять через env-переменные:

| Переменная | Значение по умолчанию | Назначение |
| --- | --- | --- |
| `SEED_USERS_COUNT` | `100` | Количество пользователей |
| `SEED_MAPS_COUNT` | `100` | Количество карт |
| `SEED_ORDERS_COUNT` | `1000` | Количество заказов |
| `SEED_OUTBOX_EVENTS_COUNT` | `200` | Количество Outbox-событий |
| `SEED_BATCH_SIZE` | `200` | Размер batch insert |

Пример:

```bash
SEED_USERS_COUNT=500 SEED_MAPS_COUNT=500 SEED_ORDERS_COUNT=5000 bun run db:seed
```

## Как работает `db:migrate`

Migration runner:

- читает SQL-файлы из `backend/database/migrations`;
- сортирует их по имени;
- проверяет таблицу `schema_migrations`;
- применяет только новые миграции;
- записывает имя примененной миграции в `schema_migrations`.

## Как работает `db:reset`

Команда:

- отключает foreign key checks;
- удаляет таблицы приложения;
- включает foreign key checks;
- запускает migration runner.

Это destructive-команда для локальной разработки. Не использовать против production-БД.

## Как работает `db:seed`

Seed-команда использует:

- `@faker-js/faker` для генерации контента;
- `mysql2` prepared statements;
- batch insert для быстрой загрузки данных.

SQL-запросы seed-команды находятся в `src/seed/commands/seed-database.ts`.
