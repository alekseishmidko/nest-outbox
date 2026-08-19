# Транзакции MySQL/InnoDB

## Transaction boundary и Unit of Work

В приложении действует правило слоев:

- controller принимает HTTP-вход и не открывает транзакции;
- service определяет границу одной бизнес-операции;
- `UnitOfWork.run()` начинает, подтверждает и откатывает транзакцию;
- repository выполняет SQL и получает `PoolConnection` из callback Unit of Work,
  когда операция затрагивает несколько repository.

Пример:

```ts
return this.unitOfWork.run(async (connection) => {
  const user = await usersRepository.createInTransaction(connection, userDto);
  const map = await mapsRepository.createInTransaction(connection, {
    ...mapDto,
    ownerUserId: user.id,
  });
  return { userId: user.id, mapId: map.id };
});
```

Внутри callback нельзя обращаться к внедренному глобальному pool. Все SQL-операции
должны получать тот же `PoolConnection`; иначе часть изменений может быть
закоммичена независимо от основной транзакции. Это правило проверяется code
review и integration-тестом rollback при ошибке второго repository.

## Цель

Этот документ нужен для тренировки конкурентного доступа к данным в MySQL/InnoDB: уровни изоляции, аномалии чтения, повторяемость чтения и базовые сценарии для ручного запуска в двух параллельных сессиях.

Проверка выполнялась на локальном MySQL `8.4.11`.

Проверяемый storage engine — `InnoDB`. Перед ручным экспериментом окружение
можно подтвердить запросами:

```sql
SELECT VERSION() AS mysql_version;
SHOW VARIABLES LIKE 'transaction_isolation';
SHOW TABLE STATUS LIKE 'transaction_lab_items';
```

Результаты ниже относятся к обычным consistent reads. Они не должны
автоматически переноситься на `SELECT ... FOR UPDATE`, `SELECT ... FOR SHARE`
или на другой storage engine.

## Optimistic и pessimistic locking

Для optimistic locking клиент читает `orders.version` и передает ее в
`PATCH /orders/:id/status`. SQL обновляет строку только при совпадении версии:

```sql
UPDATE orders
SET status = ?, version = version + 1
WHERE id = ? AND version = ?;
```

Если другой запрос уже изменил заказ, API сразу отвечает `409 Conflict`.
Блокировка в БД не удерживается, поэтому latency обычно ниже, но UX требует
повторного чтения, объединения изменений или явного сообщения о конфликте.

Pessimistic-вариант доступен через
`PATCH /orders/:id/status/pessimistic`. Он начинает транзакцию и блокирует строку:

```sql
START TRANSACTION;
SELECT id, status, version FROM orders WHERE id = ? FOR UPDATE;
UPDATE orders SET status = ?, version = version + 1 WHERE id = ?;
COMMIT;
```

| Критерий | Optimistic | Pessimistic (`FOR UPDATE`) |
| --- | --- | --- |
| UX конфликта | Быстрый `409`, клиент решает, повторять ли действие | Запрос ожидает освобождения строки и обычно завершается без конфликта |
| Latency | Ниже при редких конфликтах | Выше при конкуренции из-за lock wait |
| Риск конфликтов | Видимый version conflict | Ниже, обновления сериализуются |
| Риск для БД | Повторные запросы при конфликте | Deadlock, lock timeout, длинные транзакции |
| Когда выбирать | Чтений много, записи редкие, нельзя молча перезаписывать данные | Конфликты частые или read-modify-write должен быть строго последовательным |

Транзакция с pessimistic lock должна быть короткой: нельзя выполнять внутри нее
HTTP-вызовы или долгие вычисления. Deadlock retry безопасен только тогда, когда
вся операция идемпотентна либо ее внешние побочные эффекты выполняются после
commit.

## READ COMMITTED vs REPEATABLE READ

`READ COMMITTED` строит read view для каждого отдельного `SELECT`. Если другая транзакция успела закоммитить изменение между двумя чтениями, второй `SELECT` увидит новое значение. Это снижает вероятность долгого удержания старой версии данных, но допускает non-repeatable read.

`REPEATABLE READ` в InnoDB строит consistent read view для транзакции. Обычные `SELECT` внутри одной транзакции видят один и тот же снимок данных, даже если другая транзакция уже закоммитила изменения. Это защищает от non-repeatable read для consistent reads.

| Поведение | READ COMMITTED | REPEATABLE READ |
| --- | --- | --- |
| Dirty read | Не допускается InnoDB | Не допускается InnoDB |
| Non-repeatable read | Возможен | Не проявляется для обычного consistent read |
| Phantom read | Возможен | Не проявляется для обычного consistent read |
| Read view | На каждый `SELECT` | На транзакцию |
| Типичный плюс | Видит более свежие committed данные | Стабильный снимок данных в транзакции |
| Типичный риск | Одни и те же строки могут измениться между чтениями | Можно работать с устаревшим снимком |

## Подготовка таблицы

Выполни один раз перед сценариями:

```sql
CREATE TABLE IF NOT EXISTS transaction_lab_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  amount INT NOT NULL,
  PRIMARY KEY (id),
  KEY idx_transaction_lab_items_amount (amount)
) ENGINE = InnoDB;

DELETE FROM transaction_lab_items;
INSERT INTO transaction_lab_items (id, amount) VALUES (1, 100);
```

После экспериментов таблицу можно удалить:

```sql
DROP TABLE IF EXISTS transaction_lab_items;
```

## Dirty Read

Dirty read возникает, когда транзакция читает незакоммиченные изменения другой транзакции. В InnoDB на стандартных уровнях `READ COMMITTED` и `REPEATABLE READ` это не допускается.

### READ COMMITTED

Сессия A:

```sql
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;
START TRANSACTION;

UPDATE transaction_lab_items
SET amount = 200
WHERE id = 1;

-- Не выполняй COMMIT. Держи транзакцию открытой.
```

Сессия B:

```sql
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;
START TRANSACTION;

SELECT amount
FROM transaction_lab_items
WHERE id = 1;

COMMIT;
```

Ожидаемый результат в сессии B: `100`.

Сессия A:

```sql
ROLLBACK;
```

Вывод: сессия B не увидела незакоммиченное значение `200`, значит dirty read не произошел.

### REPEATABLE READ

Сессия A:

```sql
SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ;
START TRANSACTION;

UPDATE transaction_lab_items
SET amount = 200
WHERE id = 1;

-- Не выполняй COMMIT. Держи транзакцию открытой.
```

Сессия B:

```sql
SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ;
START TRANSACTION;

SELECT amount
FROM transaction_lab_items
WHERE id = 1;

COMMIT;
```

Ожидаемый результат в сессии B: `100`.

Сессия A:

```sql
ROLLBACK;
```

Вывод: dirty read также не произошел.

## Non-Repeatable Read

Non-repeatable read возникает, когда транзакция дважды читает одну и ту же строку, а между чтениями другая транзакция коммитит изменение. В результате первое и второе чтение возвращают разные значения.

Перед каждым запуском сбрасывай значение:

```sql
UPDATE transaction_lab_items
SET amount = 100
WHERE id = 1;
```

### READ COMMITTED

Сессия A:

```sql
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;
START TRANSACTION;

SELECT amount
FROM transaction_lab_items
WHERE id = 1;
```

Ожидаемый первый результат: `100`.

Сессия B:

```sql
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;
START TRANSACTION;

UPDATE transaction_lab_items
SET amount = 200
WHERE id = 1;

COMMIT;
```

Сессия A:

```sql
SELECT amount
FROM transaction_lab_items
WHERE id = 1;

COMMIT;
```

Ожидаемый второй результат: `200`.

Вывод: на `READ COMMITTED` non-repeatable read проявился, потому что второй `SELECT` получил новый read view и увидел committed изменение сессии B.

### REPEATABLE READ

Сессия A:

```sql
SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ;
START TRANSACTION;

SELECT amount
FROM transaction_lab_items
WHERE id = 1;
```

Ожидаемый первый результат: `100`.

Сессия B:

```sql
SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ;
START TRANSACTION;

UPDATE transaction_lab_items
SET amount = 200
WHERE id = 1;

COMMIT;
```

Сессия A:

```sql
SELECT amount
FROM transaction_lab_items
WHERE id = 1;

COMMIT;
```

Ожидаемый второй результат: `100`.

Вывод: на `REPEATABLE READ` обычный consistent read не увидел изменение, закоммиченное после первого чтения в сессии A.

## Phantom Read

Phantom read возникает, когда транзакция повторно выполняет один и тот же predicate query, а между чтениями другая транзакция вставляет или удаляет строки, подходящие под условие. В результате меняется не значение уже прочитанной строки, а набор строк.

Перед каждым запуском сбрасывай данные:

```sql
DELETE FROM transaction_lab_items;
INSERT INTO transaction_lab_items (amount) VALUES (100);
```

### READ COMMITTED

Сессия A:

```sql
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;
START TRANSACTION;

SELECT COUNT(*) AS matched_count
FROM transaction_lab_items
WHERE amount >= 100;
```

Ожидаемый первый результат: `1`.

Сессия B:

```sql
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;
START TRANSACTION;

INSERT INTO transaction_lab_items (amount) VALUES (150);

COMMIT;
```

Сессия A:

```sql
SELECT COUNT(*) AS matched_count
FROM transaction_lab_items
WHERE amount >= 100;

COMMIT;
```

Ожидаемый второй результат: `2`.

Вывод: на `READ COMMITTED` phantom read проявился, потому что второй `SELECT` увидел новую committed строку, которая подходит под тот же predicate `amount >= 100`.

### REPEATABLE READ

Сессия A:

```sql
SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ;
START TRANSACTION;

SELECT COUNT(*) AS matched_count
FROM transaction_lab_items
WHERE amount >= 100;
```

Ожидаемый первый результат: `1`.

Сессия B:

```sql
SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ;
START TRANSACTION;

INSERT INTO transaction_lab_items (amount) VALUES (150);

COMMIT;
```

Сессия A:

```sql
SELECT COUNT(*) AS matched_count
FROM transaction_lab_items
WHERE amount >= 100;

COMMIT;
```

Ожидаемый второй результат: `1`.

Вывод: на `REPEATABLE READ` обычный consistent read не увидел новую строку, потому что транзакция продолжила читать старый снимок данных.

## Сравнение сценариев

| Сценарий | READ COMMITTED | REPEATABLE READ | Вывод |
| --- | --- | --- | --- |
| Dirty read | `100 -> 100` | `100 -> 100` | Незакоммиченные изменения другой транзакции не видны |
| Non-repeatable read | `100 -> 200` | `100 -> 100` | В `READ COMMITTED` повторное чтение той же строки видит новый commit |
| Phantom read | `1 -> 2` | `1 -> 1` | В `READ COMMITTED` повторный predicate query видит новую committed строку |

Важно: эти выводы относятся к обычным consistent reads. Locking reads вроде `SELECT ... FOR UPDATE` работают иначе: они берут блокировки и могут ждать другую транзакцию или блокировать вставки в диапазон.

## Ручной запуск через Adminer

1. Открой Adminer: `http://localhost:8080`.
2. Подключись к MySQL:
   - System: `MySQL`
   - Server: `mysql`
   - Username: `app`
   - Password: `app_password`
   - Database: `nest_outbox`
3. Открой две вкладки Adminer.
4. В первой вкладке выполняй блоки `Сессия A`.
5. Во второй вкладке выполняй блоки `Сессия B`.
6. Не нажимай `COMMIT` или `ROLLBACK` раньше, чем сценарий явно просит это сделать.

Adminer удобен для визуальной проверки, но для транзакционных сценариев важно помнить: каждая вкладка должна использовать отдельное соединение. Если сомневаешься, используй mysql client в двух терминалах.

## Ручной запуск через mysql client

Запусти две независимые сессии.

Терминал A:

```bash
docker compose --env-file .env.local -f docker/docker-compose.local.yml exec mysql \
  mysql -uapp -papp_password nest_outbox
```

Терминал B:

```bash
docker compose --env-file .env.local -f docker/docker-compose.local.yml exec mysql \
  mysql -uapp -papp_password nest_outbox
```

После этого выполняй SQL-блоки `Сессия A` в первом терминале, а `Сессия B` во втором.

## API Transactions Lab

Модуль `transactions-lab` запускает те же сценарии автоматически через два отдельных MySQL-соединения.

```bash
curl -X POST http://localhost:3000/transactions-lab/non-repeatable-read
```

Ожидаемый смысл ответа:

```json
{
  "scenario": "non_repeatable_read",
  "results": [
    {
      "isolationLevel": "READ COMMITTED",
      "firstRead": 100,
      "secondRead": 200,
      "anomalyDetected": true
    },
    {
      "isolationLevel": "REPEATABLE READ",
      "firstRead": 100,
      "secondRead": 100,
      "anomalyDetected": false
    }
  ]
}
```

```bash
curl -X POST http://localhost:3000/transactions-lab/phantom-read
```

Ожидаемый смысл ответа:

```json
{
  "scenario": "phantom_read",
  "results": [
    {
      "isolationLevel": "READ COMMITTED",
      "firstRead": 1,
      "secondRead": 2,
      "anomalyDetected": true
    },
    {
      "isolationLevel": "REPEATABLE READ",
      "firstRead": 1,
      "secondRead": 1,
      "anomalyDetected": false
    }
  ]
}
```

```bash
curl -X POST http://localhost:3000/transactions-lab/deadlock
```

Ожидаемый смысл ответа:

```json
{
  "scenario": "deadlock_simulation",
  "deadlockDetected": true,
  "results": [
    {
      "transactionName": "transaction_a",
      "status": "committed",
      "errorCode": null
    },
    {
      "transactionName": "transaction_b",
      "status": "rolled_back",
      "errorCode": "ER_LOCK_DEADLOCK"
    }
  ]
}
```

## Фактическая проверка

Локальная автоматическая проверка через два соединения `mysql2` дала такой результат:

```json
{
  "version": "8.4.11",
  "dirtyRc": 100,
  "dirtyRr": 100,
  "nonRepeatRc": {
    "firstRead": 100,
    "secondRead": 200
  },
  "nonRepeatRr": {
    "firstRead": 100,
    "secondRead": 100
  },
  "phantomRc": {
    "firstCount": 1,
    "secondCount": 2
  },
  "phantomRr": {
    "firstCount": 1,
    "secondCount": 1
  }
}
```

Краткий вывод:

- dirty reads в InnoDB не допускаются на `READ COMMITTED` и `REPEATABLE READ`;
- non-repeatable read воспроизводится на `READ COMMITTED`;
- non-repeatable read не проявляется на `REPEATABLE READ` для обычных `SELECT`;
- phantom read воспроизводится на `READ COMMITTED`;
- phantom read не проявляется на `REPEATABLE READ` для обычных `SELECT`.

## Стандарт JSDoc для транзакционного кода

Публичные классы и методы документируются на русском языке. Комментарий должен
отвечать на применимые к контракту вопросы:

- цель класса или операции;
- входные параметры через `@param`, если они есть;
- возвращаемое значение через `@returns`;
- ожидаемые категории ошибок через `@throws`.

Приватные SQL-helper’ы документируются тогда, когда их блокировки, порядок
операций или обработка ошибок неочевидны из кода. JSDoc не заменяет Swagger DTO,
валидацию и тесты конкурентного поведения.
