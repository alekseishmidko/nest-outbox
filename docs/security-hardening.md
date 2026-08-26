# Security hardening

## HTTP headers

`main.ts` подключает Helmet с CSP (`default-src 'self'`, запрет object/embed и
frame ancestors), HSTS на один год с `includeSubDomains`/`preload`,
`Referrer-Policy: no-referrer` и same-origin resource policy. Это применяется ко
всем HTTP-ответам, включая Swagger; при публикации Swagger отдельно разрешайте
только нужные inline-ресурсы.

## CSRF

При `AUTH_COOKIE_MODE=true` небезопасные методы уже после появления auth cookie
требуют совпадения cookie `csrf_token` и заголовка `X-CSRF-Token` (double-submit
cookie). Login/register без auth cookie остаются доступны для получения сессии.
Bearer-only режим не меняется: JWT не отправляется браузером автоматически и
CSRF middleware не активируется.

## Media/upload

JSON/form body ограничены `JSON_BODY_LIMIT`/`FORM_BODY_LIMIT` (по умолчанию 1 MiB),
media POST защищены `RateLimitGuard`. `MediaSecurityService` ограничивает media
5 MiB (`MEDIA_MAX_BYTES`), разрешает только PNG/SVG, проверяет magic bytes и
запрещает SVG script/event-handler конструкции. Перед storage вызывается
antivirus hook с EICAR regression signature; его можно заменить на ClamAV или
внешний scanner. Для local-file storage проверяется, что resolved target
остается внутри `MEDIA_LOCAL_STORAGE_DIR`, поэтому `../` не может выйти из root.

Регрессионные unit-тесты находятся в `src/security/media-security.service.spec.ts`.
Ownership API regression уже покрывает запрет доступа к чужим users/maps/orders/media.
