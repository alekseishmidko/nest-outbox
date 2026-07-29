# База данных

## Цель

Схема БД создана для тренировки SQL, транзакций, индексов, `JOIN`, оптимизации запросов и паттерна Outbox без брокера сообщений.

Основная миграция: `backend/database/migrations/001_create_core_tables.sql`.

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
| `applied_at` | `TIMESTAMP(3)` | Время применения |

## `users`

Хранит пользователей, для которых генерируются avatar и создаются заказы.

| Поле | Тип | Назначение |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED` | Primary key |
| `email` | `VARCHAR(320)` | Email пользователя |
| `name` | `VARCHAR(255)` | Имя пользователя |
| `avatar_seed` | `VARCHAR(128)` | Seed для генерации avatar |
| `created_at` | `TIMESTAMP(3)` | Дата создания |
| `updated_at` | `TIMESTAMP(3)` | Дата обновления |

Индексы:

- `uq_users_email`: уникальный индекс по `email`.

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
| `created_at` | `TIMESTAMP(3)` | Дата создания события |

Статусы:

- `pending`
- `processing`
- `processed`
- `failed`

Индексы:

- `idx_outbox_events_status`
- `idx_outbox_events_next_retry_at`
- `idx_outbox_events_status_next_retry_at`
- `idx_outbox_events_aggregate`
- `idx_outbox_events_created_at`

## Почему `media_assets` без foreign key

`media_assets` использует полиморфную связь через `owner_type` и `owner_id`. MySQL не может выразить такой foreign key напрямую, потому что одна колонка может ссылаться на разные таблицы.

Целостность этой связи будет контролироваться на уровне service/repository-слоя.

## Почему индексы добавлены сразу

Индексы нужны не только для производительности, но и для учебных задач:

- сравнивать `EXPLAIN` до и после изменения запроса;
- смотреть влияние индексов на `JOIN`;
- видеть стоимость выборки Outbox-событий;
- измерять эффект в нагрузочных тестах.
