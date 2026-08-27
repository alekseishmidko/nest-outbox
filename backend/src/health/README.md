# Health Module

## Цель

Модуль `health` нужен для проверки состояния приложения в Docker Compose и production-окружении.

## Endpoints

- `GET /health/live`: liveness без внешних зависимостей.
- `GET /health/ready`: readiness MySQL, storage и Outbox worker.
- `GET /health`: обратно совместимый alias readiness.

## Основные задачи

- Endpoint готовности приложения.
- Endpoint живости приложения.
- Проверка подключения к MySQL и доступности storage.
- Проверка, что worker не находится в shutdown состоянии.

## Infrastructure-фокус

- Docker healthchecks.
- Production readiness.
- Простая диагностика проблем запуска.
