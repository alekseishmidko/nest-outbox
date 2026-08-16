# Docker: local, production и работа с MySQL

## Цель

Docker Compose поднимает backend, MySQL, Adminer, Prometheus, Grafana и MinIO.
Local-конфигурация предназначена для разработки с hot reload, production — для
проверки собранного runtime-образа с restart policy и отдельными volumes.

Требования:

- Docker Engine с Compose v2;
- свободные порты из env-файла;
- Bun нужен только для удобных корневых scripts, сами сервисы запускаются в Docker.

## Локальный запуск

Из корня репозитория:

```bash
bun run docker:local
```

Команда собирает development stage, ожидает healthy MySQL и готовый bucket
MinIO, применяет миграции и запускает NestJS в watch mode. Первый запуск дольше
последующих из-за установки зависимостей и сборки образов.

Проверка состояния:

```bash
docker compose --env-file .env.local \
  -f docker/docker-compose.local.yml ps

curl http://localhost:3000/health
```

## Несколько backend-инстансов

Для проверки Outbox под несколькими инстансами есть compose profile `multi-backend`.

```bash
docker compose --env-file .env.local \
  -f docker/docker-compose.local.yml \
  --profile multi-backend \
  up --build
```

В этом режиме дополнительно запускается `backend-worker` без публикации HTTP-порта. Оба backend-инстанса читают одну таблицу `outbox_events`, а `FOR UPDATE SKIP LOCKED` и `processed_events.idempotency_key` защищают от двойной обработки.

Сервисы:

- Backend: `http://localhost:3000`
- Adminer: `http://localhost:8080`
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3001`
- MinIO API: `http://localhost:9000`
- MinIO Console: `http://localhost:9001`

Фактические порты берутся из `.env.local`; значения выше являются defaults.

## Остановка и логи

```bash
bun run docker:logs
bun run docker:down
```

Обычный `down` не удаляет named volumes, поэтому MySQL, Prometheus, Grafana и
MinIO сохраняют данные. `docker compose down -v` удаляет volumes и данные без
возможности восстановления; его следует выполнять только для осознанного полного
сброса окружения.

## MinIO

MinIO используется как локальное S3-compatible хранилище для режима `MEDIA_STORAGE_MODE=s3-compatible`.

Данные подключения для `local`:

| Поле | Значение |
| --- | --- |
| Endpoint | `http://localhost:9000` |
| Console | `http://localhost:9001` |
| Access key | `minioadmin` |
| Secret key | `minioadmin` |
| Bucket | `media-assets` |

Bucket создается автоматически сервисом `minio-init` при запуске Docker Compose.

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

## mysql client

Для транзакций и сценариев с несколькими соединениями удобнее открыть два
терминала и выполнить команду в каждом:

```bash
docker compose --env-file .env.local \
  -f docker/docker-compose.local.yml exec mysql \
  mysql -uapp -p nest_outbox
```

Пароль вводится интерактивно. Такой вариант не помещает пароль в shell history.
Для root-доступа следует использовать пользователя `root` и значение
`MYSQL_ROOT_PASSWORD` из локального env.

Подключение с host-машины возможно через опубликованный `MYSQL_PORT` любым
совместимым клиентом:

```text
Host: 127.0.0.1
Port: значение MYSQL_PORT, default 3306
Database: MYSQL_DATABASE
User: MYSQL_USER
```

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
  version,
  created_at
FROM orders
ORDER BY created_at DESC
LIMIT 20;
```

Посмотреть больше учебных запросов можно в `docs/sql-examples.md`.

## Переменные окружения

Compose читает `.env.local` или `.env.prod`. Переменные из env-файла подставляются
в Compose, а нужная часть передается внутрь контейнеров.

### Приложение и MySQL

| Переменная | Назначение | Типичное значение |
| --- | --- | --- |
| `NODE_ENV` | Режим приложения | `local` / `production` |
| `APP_PORT` | Порт backend | `3000` |
| `BACKEND_IMAGE` | Имя собираемого/запускаемого образа | `nest-outbox-backend:*` |
| `MYSQL_HOST` | Host MySQL внутри контейнера backend | Compose принудительно использует `mysql` |
| `MYSQL_PORT` | Внутренний порт MySQL; в текущем Compose должен оставаться `3306` | `3306` |
| `MYSQL_DATABASE` | Имя базы | `nest_outbox` |
| `MYSQL_USER` | Пользователь приложения | `app` |
| `MYSQL_PASSWORD` | Пароль пользователя приложения | обязательный секрет production |
| `MYSQL_ROOT_PASSWORD` | Root-пароль MySQL | обязательный секрет production |
| `MYSQL_CONNECTION_LIMIT` | Максимум соединений backend pool | `10` по умолчанию приложения |
| `LOG_LEVEL` | Минимальный уровень Pino | `debug` local, `info` production |
| `SQL_SLOW_QUERY_THRESHOLD_MS` | Порог slow-query log | `100` |

### Outbox

| Переменная | Назначение | Default Compose |
| --- | --- | --- |
| `OUTBOX_POLL_INTERVAL_MS` | Интервал polling | `1000` |
| `OUTBOX_BATCH_SIZE` | Максимальный batch | `10` |
| `OUTBOX_MAX_ATTEMPTS` | Попытки до dead letter | `5` |
| `OUTBOX_RETRY_BASE_DELAY_MS` | Начальный backoff | `1000` |
| `OUTBOX_RETRY_MAX_DELAY_MS` | Верхняя граница backoff | `60000` |
| `OUTBOX_RETRY_JITTER_MS` | Случайная добавка к backoff | `250` |
| `OUTBOX_SHUTDOWN_TIMEOUT_MS` | Ожидание worker при shutdown | `10000` |

### Media, MinIO и инфраструктура

| Переменная | Назначение |
| --- | --- |
| `MEDIA_STORAGE_MODE` | `database`, `local-file` или `s3-compatible` |
| `MEDIA_LOCAL_STORAGE_DIR` | Каталог local-file внутри backend |
| `MEDIA_PUBLIC_BASE_URL` | Публичная база URL для сохраненных файлов |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET` | S3-compatible endpoint, region и bucket |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Credentials S3-compatible storage |
| `S3_FORCE_PATH_STYLE` | Path-style URLs, обычно `true` для MinIO |
| `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` | Администратор локального MinIO |
| `ADMINER_PORT`, `PROMETHEUS_PORT`, `GRAFANA_PORT` | Публичные UI-порты |
| `MINIO_API_PORT`, `MINIO_CONSOLE_PORT` | Публичные порты MinIO |
| `GRAFANA_ADMIN_USER`, `GRAFANA_ADMIN_PASSWORD` | Учетная запись Grafana |

Секреты нельзя коммитить. `.env.prod.example` служит шаблоном, а production
значения должны поступать из защищенного secret store или закрытого env-файла.

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

Production-команда собирает target `production`, запускает контейнеры в detached
mode, применяет миграции перед стартом backend и включает `restart: unless-stopped`.
Проверить запуск:

```bash
docker compose --env-file .env.prod \
  -f docker/docker-compose.prod.yml ps

docker compose --env-file .env.prod \
  -f docker/docker-compose.prod.yml logs -f backend
```

Production Compose в этом учебном проекте всё еще публикует backend, Adminer,
Prometheus, Grafana и MinIO. Перед реальным развертыванием Adminer и служебные UI
нужно убрать из публичного доступа либо закрыть firewall/VPN/reverse proxy с auth
и TLS. MySQL в production Compose наружу не публикуется. `APP_PORT` для текущего
production Compose должен оставаться `3000`, поскольку container port и
healthcheck зафиксированы на этом значении.

## Миграции и данные

Backend автоматически запускает migration runner до приложения. Примененные
версии и checksums хранятся в `schema_migrations`; изменение уже примененного
SQL-файла считается ошибкой.

Dry run вне контейнера при настроенном окружении:

```bash
bun run db:migrate:dry-run
```

Named volumes разделены между local и production (`*_local` и `*_prod`), чтобы
запуски не использовали одни данные. Перед обновлением production следует делать
backup MySQL и проверять миграции на копии базы.

## Частые проблемы

- `port is already allocated` — изменить соответствующий UI/API-порт в env-файле;
  для смены host-порта MySQL сначала нужно разделить внутренний `MYSQL_PORT` и
  host mapping в Compose.
- backend ожидает MySQL — проверить `docker compose ... ps` и healthcheck MySQL.
- migration checksum mismatch — не редактировать примененную миграцию, создать новую.
- Adminer не подключается к `localhost` — внутри Compose использовать server `mysql`.
- MinIO media недоступны — проверить `MEDIA_STORAGE_MODE`, bucket и
  `minio-init` logs.
- после изменения зависимостей используется старый volume — пересобрать образ;
  удалять `backend_node_modules` volume только осознанно.
