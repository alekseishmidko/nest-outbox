# Docker и DB-клиент

## Цель

Docker Compose поднимает локальное окружение разработки: backend, MySQL, Adminer, Prometheus и Grafana.

## Локальный запуск

```bash
bun run docker:local
```

Сервисы:

- Backend: `http://localhost:3000`
- Adminer: `http://localhost:8080`
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3001`

## Adminer

Adminer используется как виртуализированный клиент БД. Через него можно смотреть таблицы, выполнять SQL-запросы и проверять результат миграций/seed.

Открыть:

```text
http://localhost:8080
```

Данные подключения для `local`:

| Поле Adminer | Значение |
| --- | --- |
| System | `MySQL` |
| Server | `mysql` |
| Username | `app` |
| Password | `app_password` |
| Database | `nest_outbox` |

Почему `Server` равен `mysql`: Adminer запущен внутри Docker Compose network и обращается к контейнеру MySQL по имени сервиса.

## Первые SQL-запросы

Проверить список таблиц:

```sql
SHOW TABLES;
```

Проверить структуру пользователей:

```sql
DESCRIBE users;
```

Посмотреть примененные миграции:

```sql
SELECT
  version,
  applied_at
FROM schema_migrations
ORDER BY applied_at DESC;
```

Найти последние заказы:

```sql
SELECT
  id,
  user_id,
  map_id,
  status,
  total_amount,
  created_at
FROM orders
ORDER BY created_at DESC
LIMIT 20;
```

Посмотреть больше учебных запросов можно в `docs/sql-examples.md`.

## Production env

Для production-запуска нужен реальный файл `.env.prod`.

```bash
cp .env.prod.example .env.prod
```

После этого нужно заменить все `change_me` значения.

Запуск:

```bash
bun run docker:prod
```
