# SQL-примеры

## Цель

Документ содержит учебные SQL-примеры для текущей MySQL-схемы:

- `SELECT` с фильтрацией и сортировкой;
- `JOIN` между `users`, `orders`, `maps`;
- `GROUP BY` для статистики заказов;
- `EXPLAIN ANALYZE` для оценки планов запросов;
- транзакция создания заказа и записи Outbox-события;
- prepared statements через `mysql2`.

Примеры рассчитаны на схему из `backend/database/migrations/001_create_core_tables.sql`.

## SELECT с фильтрацией и сортировкой

### Найти пользователя по email

```sql
SELECT
  id,
  email,
  name,
  avatar_seed,
  created_at,
  updated_at
FROM users
WHERE email = 'user@example.com'
LIMIT 1;
```

Что тренируется:

- `SELECT`;
- `WHERE`;
- `LIMIT`;
- использование уникального индекса `uq_users_email`.

### Получить последние карты пользователя

```sql
SELECT
  id,
  title,
  description,
  latitude,
  longitude,
  owner_user_id,
  created_at,
  updated_at
FROM maps
WHERE owner_user_id = 1
ORDER BY created_at DESC
LIMIT 20 OFFSET 0;
```

Что тренируется:

- фильтрация по foreign key;
- сортировка;
- offset pagination;
- индекс `idx_maps_owner_user_id`.

### Получить заказы по статусу

```sql
SELECT
  id,
  user_id,
  map_id,
  status,
  total_amount,
  created_at,
  updated_at
FROM orders
WHERE status = 'pending'
ORDER BY created_at ASC
LIMIT 50;
```

Что тренируется:

- фильтрация по `ENUM`;
- индекс `idx_orders_status`;
- сценарий обработки очереди или админской выборки.

## JOIN между users, orders, maps

### Получить заказы с пользователем и картой

```sql
SELECT
  o.id AS order_id,
  o.status AS order_status,
  o.total_amount,
  o.created_at AS order_created_at,
  u.id AS user_id,
  u.email AS user_email,
  u.name AS user_name,
  m.id AS map_id,
  m.title AS map_title,
  m.latitude,
  m.longitude
FROM orders AS o
INNER JOIN users AS u ON u.id = o.user_id
INNER JOIN maps AS m ON m.id = o.map_id
WHERE o.status IN ('pending', 'paid')
ORDER BY o.created_at DESC
LIMIT 50;
```

Что тренируется:

- `INNER JOIN`;
- алиасы таблиц;
- выборка данных из нескольких таблиц;
- фильтрация по статусу заказа.

### Получить все заказы конкретного пользователя

```sql
SELECT
  o.id AS order_id,
  o.status,
  o.total_amount,
  m.id AS map_id,
  m.title AS map_title,
  m.description AS map_description,
  o.created_at
FROM users AS u
INNER JOIN orders AS o ON o.user_id = u.id
INNER JOIN maps AS m ON m.id = o.map_id
WHERE u.id = 1
ORDER BY o.created_at DESC;
```

Что тренируется:

- связь `users -> orders -> maps`;
- индекс `idx_orders_user_id`;
- чтение связанных бизнес-данных.

## GROUP BY для статистики заказов

### Количество и сумма заказов по статусам

```sql
SELECT
  status,
  COUNT(*) AS orders_count,
  SUM(total_amount) AS total_amount_sum,
  AVG(total_amount) AS average_order_amount
FROM orders
GROUP BY status
ORDER BY orders_count DESC;
```

Что тренируется:

- `GROUP BY`;
- агрегатные функции `COUNT`, `SUM`, `AVG`;
- статистика по `ENUM`-полю.

### Статистика заказов по пользователям

```sql
SELECT
  u.id AS user_id,
  u.email,
  u.name,
  COUNT(o.id) AS orders_count,
  COALESCE(SUM(o.total_amount), 0) AS total_amount_sum
FROM users AS u
LEFT JOIN orders AS o ON o.user_id = u.id
GROUP BY
  u.id,
  u.email,
  u.name
ORDER BY total_amount_sum DESC
LIMIT 20;
```

Что тренируется:

- `LEFT JOIN`;
- группировка с таблицей пользователей;
- `COALESCE` для пользователей без заказов;
- аналитическая выборка.

### Статистика заказов по картам

```sql
SELECT
  m.id AS map_id,
  m.title AS map_title,
  COUNT(o.id) AS orders_count,
  COALESCE(SUM(o.total_amount), 0) AS total_amount_sum
FROM maps AS m
LEFT JOIN orders AS o ON o.map_id = m.id
GROUP BY
  m.id,
  m.title
ORDER BY orders_count DESC
LIMIT 20;
```

Что тренируется:

- аналитика по `maps`;
- индекс `idx_orders_map_id`;
- сравнение популярности карт.

## EXPLAIN ANALYZE

### План запроса заказов пользователя

```sql
EXPLAIN ANALYZE
SELECT
  o.id,
  o.status,
  o.total_amount,
  o.created_at
FROM orders AS o
WHERE o.user_id = 1
ORDER BY o.created_at DESC
LIMIT 20;
```

На что смотреть:

- используется ли индекс `idx_orders_user_id`;
- сколько строк читает MySQL;
- сколько времени занимает сортировка;
- нужен ли составной индекс `(user_id, created_at)`.

### План JOIN-запроса

```sql
EXPLAIN ANALYZE
SELECT
  o.id AS order_id,
  u.email,
  m.title,
  o.status,
  o.total_amount
FROM orders AS o
INNER JOIN users AS u ON u.id = o.user_id
INNER JOIN maps AS m ON m.id = o.map_id
WHERE o.status = 'paid'
ORDER BY o.created_at DESC
LIMIT 50;
```

На что смотреть:

- с какой таблицы MySQL начинает выполнение;
- используется ли `idx_orders_status`;
- сколько строк попадает в `JOIN`;
- есть ли лишняя сортировка.

### План выборки Outbox-событий

```sql
EXPLAIN ANALYZE
SELECT
  id,
  event_type,
  aggregate_type,
  aggregate_id,
  payload,
  attempts
FROM outbox_events
WHERE status = 'pending'
  AND (next_retry_at IS NULL OR next_retry_at <= CURRENT_TIMESTAMP(3))
ORDER BY created_at ASC
LIMIT 100;
```

На что смотреть:

- используется ли `idx_outbox_events_status_next_retry_at`;
- как MySQL обрабатывает условие с `OR`;
- нужен ли другой индекс для production-нагрузки.

## Транзакция создания заказа и Outbox-события

### SQL-сценарий

```sql
START TRANSACTION;

INSERT INTO orders (
  user_id,
  map_id,
  status,
  total_amount
) VALUES (
  1,
  1,
  'pending',
  199.90
);

SET @order_id = LAST_INSERT_ID();

INSERT INTO outbox_events (
  event_type,
  aggregate_type,
  aggregate_id,
  payload,
  status,
  attempts
) VALUES (
  'order.created',
  'order',
  @order_id,
  JSON_OBJECT(
    'orderId', @order_id,
    'userId', 1,
    'mapId', 1,
    'totalAmount', 199.90
  ),
  'pending',
  0
);

COMMIT;
```

Что важно:

- заказ и Outbox-событие создаются атомарно;
- если вставка события упадет, нужно выполнить `ROLLBACK`;
- обработчик Outbox увидит событие только после `COMMIT`.

### Вариант с откатом

```sql
START TRANSACTION;

INSERT INTO orders (
  user_id,
  map_id,
  status,
  total_amount
) VALUES (
  1,
  1,
  'pending',
  199.90
);

-- Имитируем ошибку.
INSERT INTO outbox_events (
  event_type,
  aggregate_type,
  aggregate_id,
  payload
) VALUES (
  NULL,
  'order',
  LAST_INSERT_ID(),
  JSON_OBJECT('invalid', true)
);

ROLLBACK;
```

Что проверить:

- заказ не должен сохраниться;
- Outbox-событие не должно сохраниться;
- это базовый сценарий для будущего integration-теста.

## Блокировка Outbox-событий

### Выборка пачки событий worker-ом

```sql
START TRANSACTION;

SELECT
  id,
  event_type,
  aggregate_type,
  aggregate_id,
  payload,
  attempts
FROM outbox_events
WHERE status = 'pending'
  AND (next_retry_at IS NULL OR next_retry_at <= CURRENT_TIMESTAMP(3))
ORDER BY created_at ASC
LIMIT 100
FOR UPDATE SKIP LOCKED;

COMMIT;
```

Что тренируется:

- row-level locks;
- защита от двойной обработки несколькими worker-ами;
- MySQL 8 `SKIP LOCKED`.

В реальном worker-е после `SELECT ... FOR UPDATE SKIP LOCKED` нужно внутри той же транзакции перевести выбранные события в `processing`.

## Prepared statements через mysql2

### Подключение pool

```ts
import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT),
  database: process.env.MYSQL_DATABASE,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: false,
});
```

### SELECT по email

```ts
import { RowDataPacket } from 'mysql2';

type UserRow = RowDataPacket & {
  id: number;
  email: string;
  name: string;
  avatar_seed: string;
  created_at: Date;
  updated_at: Date;
};

const [rows] = await pool.execute<UserRow[]>(
  `
    SELECT
      id,
      email,
      name,
      avatar_seed,
      created_at,
      updated_at
    FROM users
    WHERE email = ?
    LIMIT 1
  `,
  [email],
);

const user = rows[0] ?? null;
```

Почему так:

- значение `email` передается отдельно;
- `mysql2` экранирует параметры;
- SQL injection через `email` не пройдет.

### INSERT заказа и Outbox-события в транзакции

```ts
import { ResultSetHeader } from 'mysql2';

const connection = await pool.getConnection();

try {
  await connection.beginTransaction();

  const [orderResult] = await connection.execute<ResultSetHeader>(
    `
      INSERT INTO orders (
        user_id,
        map_id,
        status,
        total_amount
      ) VALUES (?, ?, ?, ?)
    `,
    [userId, mapId, 'pending', totalAmount],
  );

  const orderId = orderResult.insertId;

  await connection.execute(
    `
      INSERT INTO outbox_events (
        event_type,
        aggregate_type,
        aggregate_id,
        payload,
        status,
        attempts
      ) VALUES (?, ?, ?, CAST(? AS JSON), ?, ?)
    `,
    [
      'order.created',
      'order',
      orderId,
      JSON.stringify({
        orderId,
        userId,
        mapId,
        totalAmount,
      }),
      'pending',
      0,
    ],
  );

  await connection.commit();

  return orderId;
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  connection.release();
}
```

Что тренируется:

- явное получение connection из pool;
- `beginTransaction`;
- атомарность заказа и Outbox-события;
- `commit`;
- `rollback`;
- prepared statements.

## Ошибки, которых нужно избегать

### Нельзя конкатенировать пользовательский ввод

```ts
const sql = `SELECT * FROM users WHERE email = '${email}'`;
```

Почему плохо:

- SQL injection;
- сложнее тестировать;
- MySQL не может нормально переиспользовать prepared statement.

### Нужно использовать параметры

```ts
const [rows] = await pool.execute(
  'SELECT * FROM users WHERE email = ?',
  [email],
);
```

Это базовое правило для всех repositories проекта.
