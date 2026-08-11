# Transactions Lab

## Цель

Модуль нужен для практики конкурентного доступа к данным в MySQL/InnoDB.

Он запускает учебные сценарии через два отдельных MySQL-соединения:

- non-repeatable read;
- phantom read;
- deadlock simulation.

## API

```http
POST /transactions-lab/non-repeatable-read
POST /transactions-lab/phantom-read
POST /transactions-lab/deadlock
```

## Таблица

Модуль сам создает и пересоздает учебную таблицу `transaction_lab_items`.

Эта таблица не является бизнес-таблицей приложения. Она используется только для воспроизводимых лабораторных сценариев.

## Ограничения

Endpoint'ы меняют данные в учебной таблице, поэтому они оформлены как `POST`.

Не запускай несколько lab-запросов параллельно, если хочешь получить идеально воспроизводимый результат.
