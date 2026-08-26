import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { AppModule } from '../app.module';

async function generate(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  const config = new DocumentBuilder()
    .setTitle('Nest Outbox API')
    .setDescription('Versioned HTTP contract for Nest Outbox API.')
    .setVersion(process.env.API_VERSION ?? '0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  document.components ??= {};
  document.components.schemas ??= {};
  document.components.schemas.ApiErrorResponse = {
    type: 'object',
    required: [
      'statusCode',
      'errorCode',
      'message',
      'path',
      'method',
      'timestamp',
    ],
    properties: {
      statusCode: { type: 'integer', example: 400 },
      errorCode: { type: 'string', example: 'VALIDATION_ERROR' },
      message: { type: 'string' },
      path: { type: 'string', example: '/orders' },
      method: { type: 'string', example: 'POST' },
      timestamp: { type: 'string', format: 'date-time' },
      requestId: { type: 'string', nullable: true },
      details: { nullable: true },
    },
  };
  const output = resolve(process.cwd(), '../docs/openapi.json');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  await app.close();
  console.log(`OpenAPI written to ${output}`);
}

void generate();
