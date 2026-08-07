# Orders Module

## Цель

Модуль `orders` моделирует бизнес-операции, где полезны транзакции. При создании заказа в той же транзакции будет записываться событие в `outbox_events`.

## Планируемая структура

- `controllers`: HTTP endpoints для заказов.
- `services`: бизнес-логика заказов и транзакционные сценарии.
- `repositories`: raw SQL-запросы к таблице `orders`.
- `dto`: входные DTO.

## Основные задачи

- Создание заказа.
- Изменение статуса заказа.
- Получение заказов пользователя.
- Получение заказов по карте.
- Транзакционная запись заказа и Outbox-события.
- Идемпотентное создание заказа через header `Idempotency-Key`.

## Idempotency-Key

`POST /orders` поддерживает необязательный header `Idempotency-Key`.

Цель: безопасно повторить запрос, если клиент получил timeout, оборвал соединение или не дождался ответа.

Поведение:

- первый запрос с новым ключом создает заказ, пишет `outbox_events` и сохраняет response в `idempotency_keys`;
- повторный запрос с тем же ключом и тем же body возвращает сохраненный response;
- повторный запрос с тем же ключом, но другим body возвращает `409 Conflict`;
- повторный запрос не создает второй заказ.

Пример:

```bash
curl -X POST http://localhost:3000/orders \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: order-create-001' \
  -d '{"userId":1,"mapId":1,"totalAmount":199.9}'
```

## SQL-фокус

- `JOIN` между `orders`, `users`, `maps`.
- Транзакции.
- Индексы по `user_id`, `map_id`, `status`.
- Уникальный индекс `idempotency_keys.idempotency_key`.
