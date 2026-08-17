# База данных

## Цель

Схема БД создана для тренировки SQL, транзакций, индексов, `JOIN`, оптимизации запросов и паттерна Outbox без брокера сообщений.

Миграции находятся в `backend/database/migrations` и применяются по имени файла.
`001_create_core_tables.sql` создает базовую схему, последующие миграции добавляют
надежность Outbox, optimistic locking и специализированные индексы.

Практические запросы: `docs/sql-examples.md`.
Seed и миграции: `docs/seed.md`.

## Общие решения

- База данных: MySQL 8.x.
- Движок таблиц: `InnoDB`.
- Кодировка: `utf8mb4`.
- ORM не используется.
- SQL пишется вручную.
- Доступ из приложения должен идти через `mysql2` и prepared statements.
- Бизнес-таблицы используют `BIGINT UNSIGNED AUTO_INCREMENT` как primary key.
- Временные поля используют `TIMESTAMP(3)`, чтобы видеть миллисекунды при нагрузочных тестах.

## `schema_migrations`

Служебная таблица migration runner.

| Поле | Тип | Назначение |
| --- | --- | --- |
| `version` | `VARCHAR(255)` | Имя примененной миграции |
| `checksum` | `CHAR(64)` | SHA-256 checksum SQL-файла |
| `execution_time_ms` | `INT UNSIGNED` | Время применения миграции в миллисекундах |
| `applied_at` | `TIMESTAMP(3)` | Время применения |

Migration runner:

- берет MySQL advisory lock `nest_outbox:schema_migrations`, чтобы два процесса не применяли миграции одновременно;
- запрещает изменение уже примененных миграций через checksum check;
- поддерживает dry-run режим:

```bash
bun run db:migrate:dry-run
```

Dry-run показывает, какие миграции будут применены, но не выполняет SQL-файлы и не пишет строки в `schema_migrations`.

## `users`

Хранит пользователей, для которых генерируются avatar и создаются заказы.

| Поле | Тип | Назначение |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED` | Primary key |
| `email` | `VARCHAR(320)` | Email пользователя |
| `name` | `VARCHAR(255)` | Имя пользователя |
| `avatar_seed` | `VARCHAR(128)` | Seed для генерации avatar |
| `password_hash` | `VARCHAR(255)` nullable | Argon2id hash пароля |
| `role` | `ENUM('admin', 'user')` | Роль доступа |
| `refresh_token_hash` | `CHAR(64)` nullable | SHA-256 hash текущего refresh token |
| `refresh_token_expires_at` | `TIMESTAMP(3)` nullable | Срок действия refresh token |
| `created_at` | `TIMESTAMP(3)` | Дата создания |
| `updated_at` | `TIMESTAMP(3)` | Дата обновления |

Индексы:

- `uq_users_email`: уникальный индекс по `email`.
- `idx_users_role`: выборка пользователей по роли.

## `maps`

Хранит сущности, для которых можно генерировать QR-code.

| Поле | Тип | Назначение |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED` | Primary key |
| `title` | `VARCHAR(255)` | Название карты |
| `description` | `TEXT` | Описание |
| `latitude` | `DECIMAL(10, 8)` | Широта |
| `longitude` | `DECIMAL(11, 8)` | Долгота |
| `owner_user_id` | `BIGINT UNSIGNED` | Владелец карты |
| `created_at` | `TIMESTAMP(3)` | Дата создания |
| `updated_at` | `TIMESTAMP(3)` | Дата обновления |

Индексы:

- `idx_maps_owner_user_id`: ускоряет выборку карт пользователя.
- `idx_maps_latitude_longitude`: bounding box для поиска ближайших карт.

Связи:

- `maps.owner_user_id -> users.id`.

## `orders`

Моделирует бизнес-события и транзакционные сценарии.

| Поле | Тип | Назначение |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED` | Primary key |
| `user_id` | `BIGINT UNSIGNED` | Пользователь |
| `map_id` | `BIGINT UNSIGNED` | Карта |
| `status` | `ENUM` | Статус заказа |
| `total_amount` | `DECIMAL(10, 2) UNSIGNED` | Сумма заказа |
| `version` | `INT UNSIGNED` | Версия строки для optimistic locking |
| `created_at` | `TIMESTAMP(3)` | Дата создания |
| `updated_at` | `TIMESTAMP(3)` | Дата обновления |

Статусы:

- `pending`
- `paid`
- `completed`
- `cancelled`
- `failed`

Индексы:

- `idx_orders_user_id`
- `idx_orders_map_id`
- `idx_orders_status`
- `idx_orders_user_id_status`
- `idx_orders_map_id_status`
- `idx_orders_user_created_id`
- `idx_reports_orders_status_created_covering`
- `idx_reports_orders_created_id`
- `idx_reports_orders_user_amount`
- `idx_reports_orders_map_amount`

Связи:

- `orders.user_id -> users.id`.
- `orders.map_id -> maps.id`.

## `media_assets`

Хранит результаты генерации QR-code и avatar.

| Поле | Тип | Назначение |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED` | Primary key |
| `owner_type` | `ENUM` | Тип владельца: `user`, `map`, `order` |
| `owner_id` | `BIGINT UNSIGNED` | ID владельца |
| `type` | `ENUM` | Тип медиа: `qr_code`, `avatar` |
| `mime_type` | `VARCHAR(128)` | MIME-тип результата |
| `storage_type` | `ENUM` | Способ хранения |
| `content_base64` | `LONGTEXT` | Контент в base64 |
| `file_path` | `VARCHAR(1024)` | Путь к файлу |
| `metadata` | `JSON` | Дополнительные данные генерации |
| `created_at` | `TIMESTAMP(3)` | Дата создания |

Индексы:

- `idx_media_assets_owner`: быстрый поиск медиа по владельцу.
- `idx_media_assets_type`: фильтрация по типу медиа.
- `idx_media_assets_created_at`: сортировка и анализ генерации по времени.
- `idx_media_assets_owner_type_id`: поиск последнего media определенного типа
  для владельца и covering сценарии activity report.

## `outbox_events`

Таблица для паттерна Outbox без брокера сообщений.

| Поле | Тип | Назначение |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED` | Primary key |
| `event_type` | `VARCHAR(128)` | Тип события |
| `aggregate_type` | `VARCHAR(64)` | Тип агрегата |
| `aggregate_id` | `BIGINT UNSIGNED` | ID агрегата |
| `payload` | `JSON` | Данные события |
| `status` | `ENUM` | Статус обработки |
| `attempts` | `INT UNSIGNED` | Количество попыток |
| `next_retry_at` | `TIMESTAMP(3)` | Следующая попытка обработки |
| `processed_at` | `TIMESTAMP(3)` | Время успешной обработки |
| `error` | `TEXT` | Последняя ошибка |
| `manual_retry_reason` | `TEXT` | Причина последнего ручного retry |
| `created_at` | `TIMESTAMP(3)` | Дата создания события |

Статусы:

- `pending`
- `processing`
- `processed`
- `failed`
- `dead_letter`

Индексы:

- `idx_outbox_events_status`
- `idx_outbox_events_next_retry_at`
- `idx_outbox_events_status_next_retry_at`
- `idx_outbox_events_aggregate`
- `idx_outbox_events_created_at`

## `processed_events`

Idempotency ledger для обработчиков Outbox.

| Поле | Тип | Назначение |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED` | Primary key |
| `idempotency_key` | `VARCHAR(255)` | Уникальный ключ side effect |
| `outbox_event_id` | `BIGINT UNSIGNED` | Ссылка на исходное событие |
| `event_type` | `VARCHAR(128)` | Тип события |
| `aggregate_type` | `VARCHAR(64)` | Тип агрегата |
| `aggregate_id` | `BIGINT UNSIGNED` | ID агрегата |
| `status` | `ENUM` | `processing` или `processed` |
| `processed_at` | `TIMESTAMP(3)` | Время успешной обработки |
| `created_at` | `TIMESTAMP(3)` | Дата reservation |

Индексы:

- `uq_processed_events_idempotency_key`: запрещает повторный side effect.
- `idx_processed_events_event`: поиск по типу события и агрегату.
- `idx_processed_events_outbox_event_id`: связь с outbox event.

## `idempotency_keys`

Защищает `POST /orders` от повторного создания заказа после timeout/retry клиента.

| Поле | Тип | Назначение |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED` | Primary key |
| `idempotency_key` | `VARCHAR(255)` | Значение HTTP `Idempotency-Key` |
| `request_hash` | `CHAR(64)` | SHA-256 нормализованного запроса |
| `status` | `ENUM` | `processing` или `completed` |
| `response_status_code` | `SMALLINT UNSIGNED` | Сохраненный HTTP status |
| `response_body` | `JSON` | Сохраненный ответ для повтора |
| `created_at`, `updated_at` | `TIMESTAMP(3)` | Audit timestamps |

Индексы:

- `uq_idempotency_keys_key`: один результат на ключ;
- `idx_idempotency_keys_status_created_at`: поиск незавершенных записей.

## Почему `media_assets` без foreign key

`media_assets` использует полиморфную связь через `owner_type` и `owner_id`. MySQL не может выразить такой foreign key напрямую, потому что одна колонка может ссылаться на разные таблицы.

Целостность этой связи будет контролироваться на уровне service/repository-слоя.

## Почему индексы добавлены сразу

Индексы нужны не только для производительности, но и для учебных задач:

- сравнивать `EXPLAIN` до и после изменения запроса;
- смотреть влияние индексов на `JOIN`;
- видеть стоимость выборки Outbox-событий;
- измерять эффект в нагрузочных тестах.

## Примеры SQL

Заказы пользователя вместе с картами:

```sql
SELECT o.id, o.status, o.total_amount, o.version, m.title AS map_title
FROM orders AS o
JOIN maps AS m ON m.id = o.map_id
WHERE o.user_id = ?
ORDER BY o.created_at DESC
LIMIT ?;
```

Агрегация по статусам:

```sql
SELECT status, COUNT(*) AS orders_count, SUM(total_amount) AS revenue
FROM orders
GROUP BY status
ORDER BY orders_count DESC;
```

Проверка плана выполняется на конкретных параметрах:

```sql
EXPLAIN ANALYZE
SELECT id, status, created_at
FROM orders
WHERE user_id = 1
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

Приложение передает значения через placeholders `?`; пользовательский ввод не
подставляется в SQL-строку. Больше примеров находится в `docs/sql-examples.md`.

## Транзакции и блокировки

Создание заказа и Outbox-события атомарно:

```sql
START TRANSACTION;

INSERT INTO orders (user_id, map_id, status, total_amount)
VALUES (?, ?, 'pending', ?);

INSERT INTO outbox_events (
  event_type, aggregate_type, aggregate_id, payload, status, attempts
)
VALUES ('order.created', 'order', LAST_INSERT_ID(), ?, 'pending', 0);

COMMIT;
```

Ошибка любой вставки приводит к `ROLLBACK`. Deadlock `ER_LOCK_DEADLOCK` повторяет
всю транзакцию с ограниченным exponential backoff.

Optimistic update использует версию, прочитанную клиентом:

```sql
UPDATE orders
SET status = ?, version = version + 1
WHERE id = ? AND version = ?;
```

Ноль измененных строк при существующем заказе означает version conflict и
преобразуется в `409 Conflict`. Pessimistic-вариант выполняет
`SELECT ... FOR UPDATE` и update в одной короткой транзакции. Уровни изоляции,
аномалии чтения и результаты MySQL/InnoDB описаны в `docs/transactions.md`.

## Целостность и ограничения

- Foreign keys заказов и карт используют `ON DELETE RESTRICT`.
- Полиморфный `media_assets.owner_id` не защищен foreign key.
- `ENUM` требует миграции при добавлении нового статуса.
- `DECIMAL` из `mysql2` читается строкой, чтобы не терять точность.
- Индекс ускоряет чтение ценой места и дополнительных операций при записи;
  необходимость каждого индекса проверяется через `EXPLAIN ANALYZE`.
