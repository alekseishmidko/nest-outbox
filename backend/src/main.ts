import { Logger as NestLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { createApiValidationPipe } from './common/pipes/api-validation.pipe';
import helmet from 'helmet';
import express, { NextFunction, Request, Response } from 'express';

/**
 * Создает и запускает HTTP-приложение.
 *
 * Подключает middleware безопасности, лимиты тела запроса, CSRF-проверку для
 * cookie-based auth, валидацию DTO, единый формат ошибок и Swagger.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Сигналы обрабатываются ниже явно, чтобы задать общий timeout shutdown.
  app.enableShutdownHooks([]);
  app.useLogger(app.get(Logger));
  const logger = new NestLogger('Bootstrap');
  const port = Number(process.env.APP_PORT ?? process.env.PORT ?? 3000);
  const host = process.env.APP_HOST ?? 'localhost';

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
        },
      },
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
      crossOriginResourcePolicy: { policy: 'same-origin' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT ?? '1mb' }));
  app.use(
    express.urlencoded({
      limit: process.env.FORM_BODY_LIMIT ?? '1mb',
      extended: false,
    }),
  );
  app.use(cookieCsrfMiddleware);

  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(createApiValidationPipe());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Nest Outbox API')
    .setDescription(
      'API для тренировки SQL, raw MySQL, Outbox и генерации медиа.',
    )
    .setVersion('0.1.0')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  await app.listen(port);
  registerGracefulShutdown(
    app,
    logger,
    Number(process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS ?? 10_000),
  );

  const appUrl = `http://${host}:${port}`;

  logger.log(`Приложение поднялось: ${appUrl}`);
  logger.log(`Swagger-документация доступна: ${appUrl}/docs`);
}

bootstrap();

/**
 * Закрывает HTTP, workers и инфраструктурные providers через Nest lifecycle.
 * Если provider завис, процесс завершается после ограниченного timeout.
 */
function registerGracefulShutdown(
  app: { close: () => Promise<void> },
  logger: NestLogger,
  timeoutMs: number,
): void {
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.log(
      `Graceful shutdown started: signal=${signal}, timeoutMs=${timeoutMs}`,
    );
    const timeout = new Promise<void>((resolve) =>
      setTimeout(() => {
        logger.error(
          `Graceful shutdown timeout reached: timeoutMs=${timeoutMs}`,
        );
        resolve();
      }, timeoutMs),
    );
    await Promise.race([app.close(), timeout]);
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

/**
 * Проверяет double-submit CSRF token для запросов с cookie-аутентификацией.
 *
 * Bearer-only сценарии и запросы без auth cookie пропускаются. Методы
 * GET/HEAD/OPTIONS не требуют CSRF token.
 */
function cookieCsrfMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (
    process.env.AUTH_COOKIE_MODE !== 'true' ||
    ['GET', 'HEAD', 'OPTIONS'].includes(request.method)
  ) {
    next();
    return;
  }
  const cookies = Object.fromEntries(
    (request.headers.cookie ?? '')
      .split(';')
      .filter(Boolean)
      .map((part) => {
        const [name, ...value] = part.trim().split('=');
        return [name, decodeURIComponent(value.join('='))];
      }),
  );
  if (!cookies.access_token && !cookies.refresh_token) {
    next();
    return;
  }
  const csrfHeader = request.headers['x-csrf-token'];
  if (
    !cookies.csrf_token ||
    typeof csrfHeader !== 'string' ||
    cookies.csrf_token !== csrfHeader
  ) {
    response.status(403).json({
      errorCode: 'CSRF_TOKEN_INVALID',
      message: 'Требуется корректный CSRF token',
    });
    return;
  }
  next();
}
