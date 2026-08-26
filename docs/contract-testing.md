# Contract testing

Источник HTTP-контракта — [`openapi.json`](openapi.json). Его можно обновить
локально командой:

```bash
npm --prefix backend run openapi:generate
```

`openapi.contract.spec.ts` проверяет версию API, ключевые операции orders/users/
auth/maps, DTO references, ожидаемые status codes и обязательные поля
`ApiErrorResponse`.

В CI spec генерируется заново и сравнивается с committed-файлом. Поэтому
изменение DTO, route или response нельзя случайно слить без обновления
контракта. Для pull request CI дополнительно сравнивает spec с target branch:
удаление operation/response или добавление обязательного request field считается
breaking change. Такой change разрешается только при изменении `info.version`
(сейчас `0.1.0`).

Consumer contract — это минимальный набор операций, на который могут опираться
клиенты: login/refresh, создание и смена статуса order, overview, user activity
и maps list. Полный бизнес-сценарий по-прежнему проверяется e2e.
