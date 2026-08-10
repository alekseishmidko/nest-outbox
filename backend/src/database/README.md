# Database Module

## Цель

Модуль `database` инкапсулирует работу с MySQL через `mysql2`: connection pool, транзакции, migration runner и общие утилиты выполнения SQL.

## Планируемая структура

- `connections`: создание и настройка MySQL pool.
- `migration-runner`: код runner для SQL-миграций.
- `transactions`: helper для явных транзакций.
- `types`: общие типы SQL-результатов.

SQL-файлы миграций лежат вне `src`: `backend/database/migrations`.
Код, который будет применять эти SQL-файлы, должен лежать в `src/database/migration-runner`.

## Основные задачи

- Создать MySQL connection pool через `mysql2`.
- Проверять подключение к MySQL при старте `DatabaseModule`.
- Логировать host, port, database и user без вывода пароля.
- Реализовать безопасные prepared statements.
- Реализовать helper транзакций.
- Реализовать migration runner на SQL-файлах.
- Создать служебную таблицу `schema_migrations`.
- Считать checksum миграций и запрещать изменение уже примененных SQL-файлов.
- Хранить `execution_time_ms` для анализа времени применения миграций.
- Использовать MySQL advisory lock на время миграций.
- Поддерживать dry-run режим без применения SQL.

## Migration Runner

Команды:

```bash
bun run db:migrate
bun run db:migrate:dry-run
```

Что делает runner:

- берет advisory lock `nest_outbox:schema_migrations`;
- создает или обновляет `schema_migrations`;
- считает SHA-256 checksum каждого SQL-файла;
- сверяет checksum уже примененных миграций;
- применяет только новые миграции;
- записывает `version`, `checksum`, `execution_time_ms`, `applied_at`;
- освобождает advisory lock в `finally`.

Если примененный SQL-файл изменен, runner падает с ошибкой `Checksum mismatch`.
Для старых строк без checksum runner один раз заполняет checksum текущего файла.

## SQL-фокус

- Prepared statements.
- Транзакции.
- Миграции.
- Служебные таблицы.
