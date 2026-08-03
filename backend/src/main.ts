import { Logger as NestLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { createApiValidationPipe } from './common/pipes/api-validation.pipe';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useLogger(app.get(Logger));
  const logger = new NestLogger('Bootstrap');
  const port = Number(process.env.APP_PORT ?? process.env.PORT ?? 3000);
  const host = process.env.APP_HOST ?? 'localhost';

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

  const appUrl = `http://${host}:${port}`;

  logger.log(`Приложение поднялось: ${appUrl}`);
  logger.log(`Swagger-документация доступна: ${appUrl}/docs`);
}

bootstrap();
