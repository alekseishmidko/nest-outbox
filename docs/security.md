# Authentication и безопасность

## Auth API

- `POST /auth/register` — регистрация пользователя, Argon2id password hash и JWT pair.
- `POST /auth/login` — проверка email/password.
- `POST /auth/refresh` — ротация refresh token.
- `POST /auth/logout` — отзыв refresh token текущего пользователя.

Пример:

```bash
curl -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","name":"User","password":"correct horse battery staple"}'
```

Защищенный запрос передает только access token:

```bash
curl http://localhost:3000/maps/1 \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Access token живет 15 минут. Refresh token живет 30 дней, хранится у клиента и
ротируется при каждом `/auth/refresh`. В БД сохраняется только SHA-256 hash
refresh token, не его исходное значение. Logout очищает hash.

Секреты `JWT_ACCESS_SECRET` и `JWT_REFRESH_SECRET` обязательны для production;
dev fallback в коде предназначен только для локального запуска и должен быть
заменен в deployment env.

## Roles и ownership

Роли: `user` и `admin`. Новая регистрация создает `user`; создание admin выполняет
администратор через контролируемую SQL-операцию или отдельный provisioning flow:

```sql
UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';
```

`JwtAuthGuard` валидирует Bearer access token, `RolesGuard` проверяет `@Roles`, а
`OwnershipGuard` запрещает user читать/изменять чужие users, maps, orders и media.
Администратор проходит ownership-проверки по роли.

Обычный `POST /users` оставлен только для admin; публичное создание пользователя
выполняется через `/auth/register`, чтобы пароль всегда проходил Argon2 hashing.

## Rate limiting

`RateLimitGuard` защищает register/login/refresh fixed-window лимитом в памяти
процесса:

| Переменная | Default |
| --- | ---: |
| `RATE_LIMIT_MAX` | `10` |
| `RATE_LIMIT_WINDOW_MS` | `60000` |

При превышении возвращается HTTP `429`. In-memory limiter не синхронизируется
между backend-инстансами и сбрасывается после рестарта; production с несколькими
репликами должен перенести counters в Redis/API gateway.

## Ограничения

- JWT secrets нельзя хранить в git или использовать dev fallback в production.
- Refresh token следует хранить в защищенном HttpOnly/Secure/SameSite cookie либо
  в защищенном клиентском хранилище; не помещать его в URL.
- В текущей схеме поддерживается один активный refresh token на пользователя:
  новый login инвалидирует предыдущий.
- После добавления auth старые пользователи из seed с `password_hash = NULL` не
  могут войти, пока им не назначен пароль через безопасный provisioning flow.
- Ownership guard делает SQL-проверки на каждый защищенный resource request;
  при росте нагрузки их можно заменить policy layer/cache, не ослабляя проверку.
