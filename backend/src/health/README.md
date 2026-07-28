# Health Module

## Цель

Модуль `health` нужен для проверки состояния приложения в Docker Compose и production-окружении.

## Планируемая структура

- `controllers`: endpoints для health-check.
- `services`: проверки приложения, БД и зависимостей.

## Основные задачи

- Endpoint готовности приложения.
- Endpoint живости приложения.
- Проверка подключения к MySQL.

## Infrastructure-фокус

- Docker healthchecks.
- Production readiness.
- Простая диагностика проблем запуска.
