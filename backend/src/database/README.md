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

## SQL-фокус

- Prepared statements.
- Транзакции.
- Миграции.
- Служебные таблицы.
