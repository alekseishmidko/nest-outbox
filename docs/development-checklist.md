# Чеклист разработки NestJS-приложения для тренировки SQL и Outbox

## Цель проекта

Создать backend-приложение на NestJS для тренировки работы с SQL, транзакциями, оптимизацией запросов, паттерном Outbox без брокера сообщений, генерацией QR-code/avatar-контента, нагрузочным тестированием, метриками, логированием, Swagger-документацией и Docker-окружениями `local` и `prod`.

## 0. Зафиксированный стек

- [x] Backend framework: `NestJS`.
- [x] Runtime/package manager: `Bun`.
- [x] База данных: `MySQL`.
- [x] ORM: не используем.
- [x] Работа с БД: raw SQL через отдельный database/repository-слой.
- [x] MySQL driver: `mysql2`.
- [x] Миграции: простой собственный migration runner на SQL-файлах.
- [x] HTTP validation: `class-validator` и `class-transformer`.
- [x] Env validation: `zod`.
- [x] Инфраструктура: `Docker Compose`.
- [x] API-документация: `Swagger`.
- [x] Логирование: `Pino`.
- [x] Метрики: `Prometheus`.
- [x] Визуализация: `Grafana`.
- [x] Основной учебный фокус: SQL, транзакции, индексы, `JOIN`, `SELECT`, `EXPLAIN`, Outbox на таблице БД.

## 1. Базовая архитектура проекта

- [x] Зафиксировать стек проекта.
  - Цель: заранее определить основные технологии и не менять фундамент во время разработки.
  - Выбранный стек: `NestJS`, `Bun`, `MySQL`, raw SQL без ORM, `mysql2`, `class-validator`, `class-transformer`, `zod`, `Docker Compose`, `Swagger`, `Pino`, `Prometheus`, `Grafana`.

- [x] Выбрать подход к БД.
  - Решение: не использовать ORM.
  - Цель: тренировать реальный SQL, ручное проектирование схемы, транзакции, индексы и оптимизацию запросов.
  - Доступ к БД должен быть изолирован в `database` и `repositories`, чтобы raw SQL не расползался по controllers/services.

- [x] Выбрать MySQL driver.
  - Решение: `mysql2`.
  - Цель: иметь connection pool, prepared statements и ручной контроль транзакций.

- [x] Подключить БД в проект.
  - Решение: `DatabaseModule` создает MySQL connection pool через `mysql2`.
  - Проверка: при старте выполняется `SELECT 1 AS health_check`.
  - Логи: модуль пишет старт и успешное подключение к MySQL.

- [x] Выбрать инструмент миграций без ORM.
  - Решение: простой собственный migration runner на SQL-файлах.
  - Цель: видеть весь SQL, руками управлять схемой и не прятать миграции за ORM.
  - Ожидаемая структура: `database/migrations/*.sql`.
  - Ожидаемая служебная таблица: `schema_migrations`.

- [x] Описать слои приложения.
  - `controllers`: HTTP API.
  - `services`: бизнес-логика.
  - `repositories`: доступ к данным и SQL-запросы.
  - `modules`: изолированные логические области.
  - `workers`: фоновые задачи, включая обработчик Outbox.
  - `common`: общие фильтры, guards, interceptors, utils.

- [x] Создать структуру модулей.
  - `users`
  - `maps`
  - `orders`
  - `media`
  - `outbox`
  - `database`
  - `metrics`
  - `health`
  - `seed`

## 2. Docker и окружения

- [x] Создать `docker-compose.local.yml`.
  - Цель: поднимать локальную инфраструктуру одной командой.
  - Сервисы: `backend`, `mysql`, `adminer`, `prometheus`, `grafana`.

- [x] Создать `docker-compose.prod.yml`.
  - Цель: иметь приближенное к production окружение.
  - Отличия: production env, restart policy, healthchecks, отдельные volume, отключенный hot reload.

- [x] Создать `Dockerfile` для backend.
  - Цель: запускать Nest-приложение внутри контейнера.
  - Проверить отдельные стадии: dependencies, build, runtime.

- [x] Создать `.env.local` и `.env.prod.example`.
  - Цель: разделить настройки окружений.
  - Переменные: `APP_PORT`, `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD`, `ADMINER_PORT`, `PROMETHEUS_PORT`, `GRAFANA_PORT`, `GRAFANA_ADMIN_USER`, `GRAFANA_ADMIN_PASSWORD`, `LOG_LEVEL`, `OUTBOX_POLL_INTERVAL_MS`, `OUTBOX_BATCH_SIZE`, `OUTBOX_MAX_ATTEMPTS`, `OUTBOX_RETRY_BASE_DELAY_MS`, `MEDIA_STORAGE_MODE`.

- [x] Добавить команды запуска.
  - `bun run docker:local`
  - `bun run docker:prod`
  - `bun run docker:down`
  - `bun run docker:logs`

## 3. База данных и SQL

- [x] Спроектировать таблицу `users`.
  - Цель: хранить пользователей, для которых генерируются медиа.
  - Поля: `id`, `email`, `name`, `avatar_seed`, `created_at`, `updated_at`.

- [x] Спроектировать таблицу `maps`.
  - Цель: хранить сущности, для которых можно генерировать QR-code или связанный контент.
  - Поля: `id`, `title`, `description`, `latitude`, `longitude`, `owner_user_id`, `created_at`, `updated_at`.

- [x] Спроектировать таблицу `orders`.
  - Цель: моделировать бизнес-события, на которых удобно тренировать транзакции и Outbox.
  - Поля: `id`, `user_id`, `map_id`, `status`, `total_amount`, `created_at`, `updated_at`.

- [x] Спроектировать таблицу `media_assets`.
  - Цель: хранить результат генерации QR-code/avatar.
  - Поля: `id`, `owner_type`, `owner_id`, `type`, `mime_type`, `storage_type`, `content_base64`, `file_path`, `metadata`, `created_at`.

- [x] Спроектировать таблицу `outbox_events`.
  - Цель: реализовать Outbox без брокеров.
  - Поля: `id`, `event_type`, `aggregate_type`, `aggregate_id`, `payload`, `status`, `attempts`, `next_retry_at`, `processed_at`, `error`, `created_at`.

- [x] Добавить индексы.
  - Цель: тренировать оптимизацию запросов.
  - Индексы: `users.email`, `orders.user_id`, `orders.map_id`, `orders.status`, `maps.owner_user_id`, `outbox_events.status`, `outbox_events.next_retry_at`.

- [x] Написать SQL-примеры.
  - `SELECT` с фильтрацией и сортировкой.
  - `JOIN` между `users`, `orders`, `maps`.
  - `GROUP BY` для статистики заказов.
  - `EXPLAIN ANALYZE` для оценки планов запросов.
  - Транзакция создания заказа и записи Outbox-события.
  - Prepared statements через `mysql2`.

## 4. Транзакции и Outbox

- [x] Реализовать создание заказа в транзакции.
  - Цель: атомарно создать `orders` и `outbox_events`.
  - Критерий готовности: если запись события не создалась, заказ тоже не сохраняется.

- [x] Реализовать `OutboxPublisher`.
  - Цель: периодически читать события из `outbox_events`.
  - Без брокеров: обработка идет через polling таблицы.

- [x] Реализовать блокировку событий при обработке.
  - Цель: избежать двойной обработки при нескольких инстансах приложения.
  - Изучить: `SELECT ... FOR UPDATE SKIP LOCKED` в MySQL 8.

- [x] Реализовать retry-механику.
  - Поля: `attempts`, `next_retry_at`, `error`.
  - Цель: тренировать надежную обработку ошибок.

- [x] Реализовать статусы событий.
  - `pending`
  - `processing`
  - `processed`
  - `failed`

- [x] Добавить тесты Outbox.
  - Успешная обработка события.
  - Ошибка обработчика.
  - Повторная попытка.
  - Защита от двойной обработки.

## 5. Генерация QR-code и avatar

- [x] Выбрать библиотеки генерации.
  - QR-code: `qrcode`.
  - Avatar: `@dicebear/core` и `@dicebear/collection`.

- [x] Создать модуль `media`.
  - Цель: изолировать генерацию и хранение медиа.

- [x] Реализовать генерацию QR-code для `maps`.
  - Вход: `mapId`, URL или payload.
  - Выход: `base64`, `dataUrl` или сохраненный asset.

- [x] Реализовать генерацию avatar для `users`.
  - Вход: `userId`, `avatar_seed`.
  - Выход: `base64`, `svg`, `png` или сохраненный asset.

- [x] Добавить API для медиа.
  - `POST /media/users/:userId/avatar`
  - `POST /media/maps/:mapId/qr`
  - `GET /media/:id`

- [x] Связать генерацию с Outbox.
  - Пример: после создания заказа создать событие `order.created`.
  - Обработчик события генерирует QR-code или avatar.

## 6. Seed и генерация данных

- [x] Выбрать библиотеку seed/fake-data.
  - Варианты: `@faker-js/faker` и кастомный seed runner на raw SQL.

- [x] Реализовать seed пользователей.
  - Цель: быстро создавать тестовый объем данных.
  - Минимум: 100 пользователей.

- [x] Реализовать seed карт.
  - Минимум: 100 карт.

- [x] Реализовать seed заказов.
  - Минимум: 1000 заказов.

- [x] Реализовать seed outbox-событий.
  - Цель: тестировать worker под нагрузкой.

- [x] Добавить команды.
  - `bun run db:seed`
  - `bun run db:reset`
  - `bun run db:migrate`

## 7. HTTP API и Swagger

- [x] Подключить Swagger.
  - Цель: иметь виртуальную документацию API.
  - URL: `/docs`.

- [x] Описать DTO для всех запросов.
  - Цель: валидация входных данных и понятная Swagger-схема.

- [x] Добавить CRUD для `users`.
  - `POST /users`
  - `GET /users`
  - `GET /users/:id`
  - `PATCH /users/:id`
  - `DELETE /users/:id`

- [x] Добавить CRUD для `maps`.

- [x] Добавить API для `orders`.
  - Создание заказа.
  - Изменение статуса.
  - Получение заказов пользователя.
  - Получение заказов по карте.

- [x] Добавить API для просмотра Outbox.
  - `GET /outbox/events`
  - `GET /outbox/events/:id`
  - `POST /outbox/events/:id/retry`

## 8. Виртуализированный клиент БД

- [x] Добавить `Adminer` в Docker Compose.
  - Цель: удобно смотреть таблицы, писать SQL и проверять данные.

- [x] Подготовить подключение к MySQL.
  - Host: `mysql`
  - Port: `3306`
  - Database: `nest_outbox`
  - User: `app`

- [x] Добавить инструкцию в документацию.
  - Как открыть клиент.
  - Как подключиться.
  - Какие SQL-запросы попробовать первыми.

## 9. Метрики, логгирование и визуализация

- [x] Подключить структурное логгирование.
  - Рекомендация: `nestjs-pino`.
  - Цель: JSON-логи, correlation id, уровень логов через env.

- [x] Добавить request logging.
  - Метод.
  - URL.
  - Status code.
  - Latency.
  - Request id.

- [x] Добавить метрики Prometheus.
  - HTTP latency.
  - HTTP request count.
  - Outbox processed count.
  - Outbox failed count.
  - Outbox processing duration.
  - DB query duration, если выбранная библиотека позволяет.

- [x] Добавить endpoint `/metrics`.

- [x] Добавить Grafana в Docker Compose.
  - Цель: визуализация метрик.

- [x] Создать dashboard.
  - HTTP RPS.
  - Latency p50/p95/p99.
  - Error rate.
  - Outbox pending/failed/processed.
  - CPU/RAM контейнеров, если будет добавлен exporter.

## 10. Нагрузочное тестирование

- [x] Выбрать инструмент.
  - Рекомендация: `k6`.

- [x] Добавить сценарии нагрузки.
  - Создание пользователей.
  - Создание карт.
  - Создание заказов.
  - Генерация QR-code/avatar.
  - Чтение списков с JOIN-запросами.

- [x] Добавить smoke-тест нагрузки.
  - Цель: быстрая проверка, что API живой.

- [x] Добавить load-тест.
  - Цель: стабильная нагрузка в течение нескольких минут.

- [x] Добавить stress-тест.
  - Цель: понять пределы приложения.

- [x] Документировать результаты.
  - RPS.
  - Latency p95.
  - Error rate.
  - Узкие места.
  - Какие SQL-запросы оптимизировались.

## 11. Оптимизация SQL

- [x] Добавить endpoint со сложным JOIN.
  - Пример: пользователь, его заказы, карты и медиа.

- [x] Снять `EXPLAIN ANALYZE` до индексов.

- [x] Добавить индекс.

- [x] Снять `EXPLAIN ANALYZE` после индекса.

- [x] Зафиксировать выводы в документации.
  - Что было медленно.
  - Какой индекс помог.
  - Как изменился план запроса.

- [x] Добавить пагинацию.
  - Offset pagination.
  - Cursor pagination.
  - Сравнить поведение под нагрузкой.

## 12. Тесты

- [x] Unit-тесты сервисов.
  - `users`
  - `maps`
  - `orders`
  - `media`
  - `outbox`

- [x] Integration-тесты репозиториев.
  - Цель: проверять реальные SQL-запросы на тестовой БД.

- [x] E2E-тесты API.
  - Создание пользователя.
  - Создание карты.
  - Создание заказа.
  - Генерация медиа.
  - Обработка Outbox.

- [x] Тесты транзакций.
  - Ошибка внутри транзакции откатывает все изменения.

- [x] Тесты производительности критичных запросов.
  - Цель: зафиксировать допустимое время выполнения ключевых операций.

## 13. Документация

- [ ] Создать `docs/architecture.md`.
  - Описание модулей.
  - Поток данных.
  - Почему выбран Outbox.

- [x] Создать `docs/database.md`.
  - Таблицы.
  - Индексы.
  - Примеры SQL.
  - Транзакции.

- [x] Создать `docs/outbox.md`.
  - Цель паттерна.
  - Схема таблицы.
  - Алгоритм polling.
  - Retry.
  - Ограничения подхода без брокера.

- [x] Создать `docs/media.md`.
  - Генерация QR-code.
  - Генерация avatar.
  - Форматы хранения.
  - Примеры API.

- [x] Создать `docs/docker.md`.
  - Запуск local.
  - Запуск prod.
  - Переменные окружения.
  - Работа с БД-клиентом.

- [x] Создать `docs/load-testing.md`.
  - Как запускать k6.
  - Какие сценарии есть.
  - Как читать результаты.

- [x] Создать `docs/observability.md`.
  - Логи.
  - Метрики.
  - Prometheus.
  - Grafana.

- [x] Создать `docs/transactions.md`.
  - `READ COMMITTED` vs `REPEATABLE READ`.
  - Dirty reads.
  - Non-repeatable reads.
  - Результаты проверки на MySQL/InnoDB.

- [x] Добавлять JSDoc на русском языке к публичным классам и методам.
  - Цель.
  - Входные параметры.
  - Возвращаемое значение.
  - Возможные ошибки.

## 14. Качество кода

- [x] Настроить strict TypeScript.

- [x] Настроить ESLint и Prettier.

- [x] Ввести единый формат ошибок API.

- [x] Ввести DTO и validation pipe.

- [x] Ввести mapper-слой, если ORM-модели начинают протекать наружу.
  - ORM не используется.
  - SQL-row преобразуются в API/domain record через mapper-методы внутри repository.

- [x] Проверять SOLID.
  - Один сервис не должен делать все.
  - Генерация медиа не должна знать детали HTTP.
  - Outbox worker не должен содержать бизнес-логику заказов.

- [x] Проверять KISS.
  - Не добавлять абстракции раньше необходимости.

- [x] Проверять DRY.
  - Общие SQL/DTO/helper-части выносить только при реальном повторении.

## 15. Следующие backend-навыки

- [ ] Углубить работу с транзакциями.
  - Цель: научиться управлять конкурентным доступом к данным, понимать аномалии чтения и проектировать надежные retry/locking сценарии.
  - [x] Описать разницу `READ COMMITTED` vs `REPEATABLE READ`.
  - [x] Проверить поведение MySQL/InnoDB на `READ COMMITTED`.
  - [x] Проверить поведение MySQL/InnoDB на `REPEATABLE READ`.
  - [x] Подготовить SQL-сценарий для dirty reads.
  - [x] Зафиксировать вывод: dirty reads в InnoDB не допускаются на стандартных уровнях изоляции, но важно понимать саму аномалию.
  - [x] Подготовить SQL-сценарий для non-repeatable reads.
  - [x] Подготовить SQL-сценарий для phantom reads.
  - [x] Сравнить результаты одних и тех же сценариев на разных isolation levels.
  - [x] Создать `docs/transactions.md`.
  - [x] Добавить примеры ручного запуска двух параллельных транзакций через Adminer/mysql client.
  - [x] Создать учебный модуль `transactions-lab` или `concurrency-lab`.
  - [x] Добавить endpoint для демонстрации non-repeatable read.
  - [x] Добавить endpoint для демонстрации phantom read.
  - [x] Добавить endpoint для deadlock simulation.
  - [x] Реализовать deadlock simulation на двух транзакциях, которые обновляют строки в разном порядке.
  - [x] Добавить retry при deadlock.
  - [x] Обрабатывать MySQL error code `ER_LOCK_DEADLOCK`.
  - [x] Ограничить retry count и добавить backoff между попытками.
  - [x] Логировать номер попытки, код ошибки, transaction id/request id и итог операции.
  - [x] Добавить optimistic locking через поле `version`.
  - [x] Добавить `version` в таблицу, где удобно тренировать конкурентные обновления, например `orders`.
  - [x] Обновлять запись через условие `WHERE id = ? AND version = ?`.
  - [x] При конфликте версии возвращать понятную API-ошибку `409 Conflict`.
  - [x] Добавить pessimistic locking через `SELECT ... FOR UPDATE`.
  - [x] Реализовать пример безопасного изменения заказа внутри транзакции с блокировкой строки.
  - [x] Сравнить optimistic и pessimistic locking по UX, latency и риску конфликтов.
  - [x] Добавить integration-тесты на deadlock retry.
  - [x] Добавить integration-тесты на optimistic locking conflict.
  - [x] Добавить integration-тесты на `SELECT ... FOR UPDATE`.
  - [x] Добавить e2e-тесты API для конфликтов конкурентного обновления.
  - Добавить метрики: deadlock count, transaction retry count, lock wait duration.
  - Зафиксировать выводы: когда выбирать optimistic locking, когда pessimistic locking, где retry безопасен, а где может создать дубли.

- [x] Углубить SQL-оптимизацию.
  - [x] Создать модуль `reports`.
  - [x] Добавить тяжелые аналитические запросы.
  - [x] Использовать `GROUP BY`.
  - [x] Использовать window functions: `ROW_NUMBER`, `RANK`, `SUM() OVER`.
  - [x] Сравнить `OFFSET` и cursor pagination на большом объеме данных.
  - [x] Фиксировать `EXPLAIN ANALYZE` до и после оптимизации.
  - [x] Изучить covering indexes.
  - [x] Изучить порядок колонок в composite indexes.
  - [x] Добавить пример плохого индекса и объяснить, почему он не используется.

- [x] Усилить надежность Outbox.
  - [x] Добавить idempotency key для обработчиков.
  - [x] Добавить таблицу `processed_events`.
  - [x] Защититься от повторной генерации media.
  - [x] Добавить manual retry endpoint с причиной.
  - [x] Добавить dead-letter статус.
  - [x] Описать max attempts policy.
  - [x] Настроить backoff strategy.
  - [x] Реализовать graceful shutdown worker'а.
  - [x] Проверить несколько backend-инстансов в Docker Compose.

- [x] Добавить Idempotency API.
  - [x] Поддержать header `Idempotency-Key` для `POST /orders`.
  - [x] Добавить таблицу `idempotency_keys`.
  - [x] Повторный запрос с тем же ключом должен возвращать прежний результат.
  - [x] Повторный запрос не должен создавать второй заказ.
  - [x] Добавить тесты на timeout/retry сценарий клиента.

- [x] Добавить бизнес-модуль `routes` для расстояний и подбора маршрута.
  - Оценка требования: хорошее расширение проекта, потому что связывает доменную логику с SQL, индексами, DTO, тестами и метриками.
  - Ограничение: точный дорожный маршрут без внешнего routing provider или собственной графовой модели дорог невозможен; MVP должен считать геодезическое расстояние и подбирать подходящие точки/карты по заданным критериям.
  - [x] MVP: расчет расстояния между двумя координатами через Haversine или `ST_Distance_Sphere`.
  - [x] MVP: поиск ближайших `maps` от заданной точки с фильтрацией по радиусу.
  - [x] MVP: подбор подходящего маршрута между двумя `maps` как direct route с расчетом расстояния и подбором промежуточных точек-кандидатов.
  - Расширение: добавить таблицу `route_edges` для графа переходов между картами/локациями.
  - Расширение: реализовать алгоритм Dijkstra или A* поверх `route_edges`.
  - Расширение: добавить критерии маршрута: минимальная дистанция, наличие media, активность заказов, владелец карты, статус заказов.
  - [x] SQL-фокус: bounding box перед точным расчетом расстояния, composite indexes по `latitude`/`longitude`.
  - [x] API:
    - `POST /routes/distance`
    - `GET /routes/nearby`
    - `POST /routes/search`
  - [x] DTO: координаты origin/destination, `mapId`, радиус поиска, limit.
  - [x] Repository: весь SQL поиска расстояний и ближайших точек держать в `routes/repositories`.
  - [x] Service: расчет расстояния и выбор маршрута держать в `routes/services`, без HTTP-деталей.
  - [x] Tests: unit-тесты формулы расстояния, integration-тесты SQL-поиска ближайших карт, e2e-тесты API.
  - [x] Observability: метрики latency поиска маршрута, количество route search запросов, логирование выбранной стратегии.
  - [x] Документация: создать `docs/routes.md` с формулами, SQL-примерами, индексами, ограничениями MVP и планом перехода к графовой модели.

- [x] Добавить auth и безопасность.
  - [x] JWT auth.
  - [x] Refresh tokens.
  - [x] Password hashing через `argon2` или `bcrypt`.
  - [x] Roles: `admin`, `user`.
  - [x] Guards.
  - [x] Ownership checks: пользователь не может смотреть чужие карты/заказы.
  - [x] Rate limiting.

- [x] Расширить хранение media.
  - Поддержать storage mode `database`.
  - Поддержать storage mode `local-file`.
  - Поддержать storage mode `s3-compatible`.
  - Добавить MinIO в Docker Compose.
  - Не раскрывать детали storage в HTTP/controller слое.

- [x] Добавить CI.
  - [x] GitHub Actions или локальный `ci` script.
  - [x] `bun run format:check`.
  - [x] `bun run lint:check`.
  - [x] `bun run build`.
  - [x] `bun run test`.
  - [x] Отдельный job для integration/e2e с MySQL service.

- [x] Улучшить migration runner.
  - [x] Добавить checksum миграций.
  - [x] Запретить изменение уже примененной миграции.
  - [x] Добавить `checksum` в `schema_migrations`.
  - [x] Добавить `execution_time_ms` в `schema_migrations`.
  - [x] Добавить advisory lock на время миграций.
  - [x] Добавить dry-run режим.

- [ ] Углубить observability.
  - [x] Прокидывать request id в SQL logs.
  - [x] Добавить slow query logging на уровне приложения.
  - [x] Добавить dashboard по DB query duration per operation.
  - [x] Добавить Prometheus alerting rules.
  - [x] Стандартизировать structured error logs.
  - [x] Добавить correlation id для Outbox events.

## 16. Рекомендуемый порядок разработки

- [ ] Этап 1: Docker local, MySQL, DB-клиент.
- [ ] Этап 2: схема БД, миграции, seed.
- [ ] Этап 3: CRUD `users`, `maps`, `orders`.
- [ ] Этап 4: Swagger и DTO validation.
- [ ] Этап 5: SQL-запросы, JOIN, пагинация, индексы.
- [ ] Этап 6: транзакция создания заказа.
- [ ] Этап 7: таблица Outbox и запись события в транзакции.
- [ ] Этап 8: Outbox worker, retry, блокировки.
- [ ] Этап 9: генерация QR-code/avatar через события.
- [x] Этап 10: логгирование, метрики, Prometheus, Grafana.
- [ ] Этап 11: нагрузочные тесты k6.
- [ ] Этап 12: оптимизация SQL на основе метрик и `EXPLAIN ANALYZE`.
- [ ] Этап 13: расширение тестов.
- [ ] Этап 14: финальная документация по модулям.
- [x] Этап 15: Idempotency API для `POST /orders`.
- [ ] Этап 16: Outbox idempotency и dead-letter.
- [ ] Этап 17: Transaction isolation и deadlock demos.
- [x] Этап 18: Reports module с window functions.
- [ ] Этап 19: MinIO storage для media.
- [ ] Этап 20: CI pipeline.
- [ ] Этап 21: бизнес-модуль `routes`, расчет расстояний и подбор маршрута.
- [ ] Этап 22: transaction lab, isolation levels, deadlocks и locking strategies.

## 23. Следующий backlog: паттерны и инженерные практики

Пункты ниже декомпозированы по приоритету. Для каждой инициативы сначала добавить
документацию и тесты, затем реализацию и только после этого включать её в общий
Definition of Done.

### P0 — надежность и корректность данных

- [x] Inbox pattern для входящих событий.
  - [x] Создать миграцию таблицы `inbox_events` с `event_id UNIQUE`, типом события, payload, статусом, количеством попыток и timestamps.
  - [x] Реализовать repository атомарного claim события и переходы `received → processing → processed/failed`.
  - [x] Добавить защиту от повторной обработки одного `event_id`.
  - [x] Добавить retry с backoff и dead-letter статусом.
  - [x] Добавить integration-тесты повторной доставки и конкурентного claim.
  - [x] Добавить метрики `inbox_processed_total`, `inbox_failed_total`, `inbox_lag_seconds`.
  - [x] Создать `docs/inbox.md` с алгоритмом и ограничениями.

- [x] Transaction boundary и Unit of Work.
  - [x] Зафиксировать правило: controller не открывает транзакции, service задает бизнес-границу, repository выполняет SQL.
  - [x] Создать `UnitOfWork.run()` с передачей `PoolConnection` в несколько repository.
  - [x] Запретить использование глобального pool внутри callback транзакции.
  - [x] Добавить rollback-тест при ошибке второго repository.
  - [x] Добавить JSDoc на публичные методы Unit of Work.

- [x] Надежный Outbox worker.
  - [x] Добавить dead-letter причину и stack/error code в `outbox_events`.
  - [x] Реализовать административный requeue dead-letter событий.
  - [x] Добавить lease/fencing token для нескольких worker-инстансов.
  - [x] Добавить integration-тесты конкурирующих worker-ов.
  - [x] Добавить alert на backlog, возраст oldest event и dead-letter rate.

- [x] Усилить refresh-token security.
  - [x] Добавить таблицу refresh-токенов с `token_family_id`, `rotated_at`, `revoked_at`.
  - [x] Реализовать rotation с обнаружением повторного использования старого токена.
  - [x] Отзывать всю token family при reuse detection.
  - [x] Добавить unit/e2e-тесты refresh, logout, reuse и expiry.
  - [x] Обновить `docs/security.md` и `docs/database.md`.
  - [x] Документировать компрометацию refresh-сессии, массовый logout всех family пользователя и ограничения access JWT.

### P1 — масштабирование бизнес-логики

- [X] CQRS для `orders` и `users`.
  - [X] Выделить command handlers для создания заказа и изменения статуса.
  - [X] Выделить query handlers для overview, activity и pagination.
  - [X] Оставить controller тонким и перенести orchestration в handlers.
  - [X] Сохранить существующие HTTP-контракты.
  - [X] Добавить unit-тесты handlers и e2e-регрессию API.
  - [X] Создать `docs/cqrs.md` с критериями, когда CQRS не нужен.

- [x] Domain events и Process Manager/Saga.
  - [x] Описать события `OrderCreated`, `OrderStatusChanged`, `MediaGenerated`.
  - [x] Отделить доменное событие от инфраструктурной записи Outbox.
  - [x] Реализовать state machine заказа и допустимые переходы статусов.
  - [x] Добавить compensating action для неуспешной стадии процесса.
  - [x] Добавить integration-тесты resume после падения каждой стадии.
  - [x] Создать `docs/domain-events-saga.md` со схемой, lifecycle и ограничениями compensation.

- [x] Specification pattern для фильтров.
  - [x] Создать спецификации ownership, status, nearby и date range.
  - [x] Реализовать композицию `and/or/not` без конкатенации небезопасного SQL.
  - [x] Покрыть каждую спецификацию unit-тестами SQL-параметров.
  - [x] Сравнить читаемость соотношения specification/query object в документации.
  - [x] Создать `docs/specification-pattern.md` со схемой и правилами границ абстракции.

- [x] Audit log и soft delete.
  - [x] Добавить миграции `deleted_at`, `created_by`, `updated_by` где необходимо.
  - [x] Создать таблицу `audit_log` с actor, action, entity, before/after JSON и request id.
  - [x] Записывать изменения статуса заказа, ownership и ролей.
  - [x] Исключить soft-deleted записи из обычных запросов.
  - [x] Добавить integration-тесты аудита и восстановления доступа.

- [x] Redis-кэш и distributed rate limiting.
  - [x] Выбрать ключи и TTL для nearby routes, карт и read-heavy запросов.
  - [x] Добавить cache-aside с invalidation при изменении карты.
  - [x] Перенести rate limit counter в Redis для нескольких backend-инстансов.
  - [x] Реализовать fallback при недоступном Redis.
  - [x] Добавить метрики cache hit/miss и integration-тесты invalidation.

### P1 — внешние зависимости и эксплуатация

- [ ] Circuit breaker и timeout policy.
  - [ ] Ввести единые timeout для storage, email, routing provider и платежей.
  - [ ] Реализовать состояния `closed`, `open`, `half-open`.
  - [ ] Ограничить retry и исключить retry для permanent errors.
  - [ ] Добавить fallback или понятную ошибку API.
  - [ ] Добавить метрики state changes, rejected calls и recovery time.
  - [ ] Добавить integration-тесты timeout, open circuit и recovery.

- [ ] Read models для отчетов.
  - [ ] Зафиксировать медленные JOIN через slow-query metrics и `EXPLAIN ANALYZE`.
  - [ ] Спроектировать read model для order overview и user activity.
  - [ ] Обновлять read model через Outbox/domain events.
  - [ ] Реализовать rebuild command из primary tables.
  - [ ] Сравнить latency и консистентность с текущими JOIN-тестами.

- [ ] Cursor pagination во всех больших коллекциях.
  - [ ] Стандартизировать cursor `(created_at, id)` и формат ответа.
  - [ ] Добавить composite indexes под каждый cursor query.
  - [ ] Поддержать backward-compatible offset режим на переходный период.
  - [ ] Добавить integration-тесты duplicate/missing rows при concurrent inserts.

- [ ] SQL query objects и performance checks.
  - [ ] Вынести сложные SQL-запросы в именованные query objects.
  - [ ] Добавить snapshots/проверки обязательных predicates и параметров.
  - [ ] Зафиксировать baseline latency и план `EXPLAIN ANALYZE`.
  - [ ] Добавить performance-тесты на критичные JOIN, routes и pagination.

- [x] Readiness/liveness и graceful shutdown.
  - [x] Разделить `/health/live` и `/health/ready`.
  - [x] Проверять MySQL, storage и состояние worker в readiness.
  - [x] Останавливать HTTP, worker и pool через Nest lifecycle в заданном порядке.
  - [x] Добавить timeout graceful shutdown и соответствующие тесты.

### P2 — качество, безопасность и CI

- [x] Audit log и soft delete.
  - [x] Добавить `deleted_at`, `created_by`, `updated_by` и миграцию `audit_log`.
  - [x] Аудитировать status заказа, ownership карты и изменение ролей.
  - [x] Исключать soft-deleted записи из обычных запросов и auth/ownership checks.
  - [x] Добавить restore endpoints и integration-регрессию доступа.
  - [x] Описать схему и эксплуатационные критерии в `docs/audit-soft-delete.md`.

- [x] Security hardening.
  - [x] Подключить Helmet, CSP, HSTS и secure headers.
  - [x] Добавить double-submit CSRF-защиту для cookie-based auth сценариев.
  - [x] Ограничить размер тела и частоту media/upload-запросов.
  - [x] Проверять MIME/content, запрещать path traversal и выполнять antivirus hook.
  - [x] Добавить security regression-тесты media validation; ownership покрыт API e2e.

- [x] Contract tests.
  - [x] Генерировать OpenAPI spec в CI.
  - [x] Проверять DTO, status codes и error envelope против контракта.
  - [x] Добавить consumer contract для ключевых endpoint-ов.
  - [x] Запретить breaking changes без изменения версии API.

- [ ] Property-based и mutation testing.
  - [ ] Генерировать координаты и проверять симметрию/неотрицательность расстояния.
  - [ ] Проверять cursor pagination на случайных вставках.
  - [ ] Проверять retry/backoff и idempotency на случайных последовательностях.
  - [ ] Настроить mutation testing для locking, Outbox и ownership-кода.

- [ ] Расширить k6 и CI.
  - [ ] Добавить сценарии конкурентного update заказа.
  - [ ] Добавить нагрузку на routes, login и rate limit.
  - [ ] Добавить отдельные jobs security scan, contract tests и performance smoke.
  - [ ] Сохранять отчеты и thresholds как CI artifacts.

### Definition of Done для каждого пункта backlog

- [ ] Есть миграции и rollback/операционная инструкция.
- [ ] Есть unit-тесты бизнес-логики.
- [ ] Есть integration-тесты SQL/конкурентности, если пункт связан с БД.
- [ ] Есть e2e или contract-тест публичного API, если меняется API.
- [ ] Есть structured logs, metrics и alerting для production-сценария.
- [ ] Есть русскоязычный JSDoc публичных классов и методов.
- [ ] Есть документация в `docs/` с целью, ограничениями и примером запуска.
- [ ] Обновлены Docker/CI scripts и переменные окружения.

## 24. Definition of Done

- [ ] Приложение запускается через Docker для `local`.
- [ ] Приложение запускается через Docker для `prod`.
- [ ] БД поднимается автоматически.
- [ ] Миграции применяются автоматически или одной документированной командой.
- [ ] Seed заполняет БД тестовыми данными.
- [ ] Swagger доступен и описывает все публичные endpoints.
- [ ] DB-клиент доступен из Docker.
- [ ] Есть рабочие CRUD endpoints.
- [ ] Есть генерация QR-code.
- [ ] Есть генерация avatar.
- [ ] Есть таблица Outbox.
- [ ] Создание заказа и запись Outbox-события выполняются в одной транзакции.
- [ ] Outbox worker обрабатывает события без брокера.
- [ ] Есть retry и обработка ошибок Outbox.
- [x] Есть структурные логи.
- [x] Есть `/metrics`.
- [x] Prometheus собирает метрики.
- [x] Grafana показывает dashboard.
- [x] Есть k6-сценарии.
- [ ] Есть unit, integration и e2e тесты.
- [x] Есть CI для format, lint, build и test.
- [x] Есть отдельный CI job для integration/e2e с MySQL service.
- [ ] Есть бизнес-модуль `routes` для расчета расстояний и подбора маршрута.
- [ ] Есть transaction lab с примерами isolation levels, deadlock retry, optimistic locking и pessimistic locking.
- [ ] Есть документация по каждому модулю.
- [ ] Ключевые публичные классы и методы имеют JSDoc на русском языке.
