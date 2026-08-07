import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

jest.mock('@dicebear/core', () => ({
  createAvatar: jest.fn(() => ({
    toString: () => '<svg data-testid="avatar" />',
  })),
}));

jest.mock('@dicebear/collection', () => ({
  identicon: {},
}));

import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { createApiValidationPipe } from './common/pipes/api-validation.pipe';
import { OutboxEventStatus } from './outbox/dto/outbox-event-status.dto';
import { OutboxPublisher } from './outbox/workers/outbox-publisher';
import {
  applyDatabaseEnv,
  createDatabaseTestKit,
  isDatabaseTestEnabled,
} from './test-utils/database-test-kit';

const describeE2e = isDatabaseTestEnabled('RUN_E2E_TESTS')
  ? describe
  : describe.skip;

describeE2e('API e2e', () => {
  let app: INestApplication;
  let kit: Awaited<ReturnType<typeof createDatabaseTestKit>>;

  beforeAll(async () => {
    kit = await createDatabaseTestKit('api_e2e');
    applyDatabaseEnv(kit.databaseName);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ApiExceptionFilter());
    app.useGlobalPipes(createApiValidationPipe());

    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    if (kit) {
      await kit.destroy();
    }
  });

  beforeEach(async () => {
    await kit.resetTables();
  });

  it('создает пользователя, карту, заказ, генерирует медиа и обрабатывает Outbox', async () => {
    const server = app.getHttpServer();
    const userResponse = await request(server)
      .post('/users')
      .send({
        email: 'e2e-user@example.com',
        name: 'E2E User',
        avatarSeed: 'e2e-seed',
      })
      .expect(201);
    const userId = userResponse.body.id as number;
    const mapResponse = await request(server)
      .post('/maps')
      .send({
        title: 'E2E Map',
        description: 'E2E map for QR-code generation',
        latitude: 40.785091,
        longitude: -73.968285,
        ownerUserId: userId,
      })
      .expect(201);
    const mapId = mapResponse.body.id as number;
    const orderResponse = await request(server)
      .post('/orders')
      .send({
        userId,
        mapId,
        totalAmount: 49.9,
      })
      .expect(201);

    await request(server)
      .post(`/media/users/${userId}/avatar`)
      .send({})
      .expect(201);
    await request(server)
      .post(`/media/maps/${mapId}/qr`)
      .send({ payload: 'payload' })
      .expect(201);

    const pendingEventsResponse = await request(server)
      .get('/outbox/events')
      .query({ status: OutboxEventStatus.Pending, limit: 10, offset: 0 })
      .expect(200);
    const eventId = pendingEventsResponse.body[0].id as number;
    const publisher = app.get(OutboxPublisher);
    const publishResult = await publisher.processDueBatch();

    await request(server)
      .get(`/outbox/events/${eventId}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.status).toBe(OutboxEventStatus.Processed);
      });
    const offsetActivityResponse = await request(server)
      .get(`/users/${userId}/activity`)
      .query({ pagination: 'offset', limit: 1, offset: 0 })
      .expect(200);
    const cursorActivityResponse = await request(server)
      .get(`/users/${userId}/activity`)
      .query({ pagination: 'cursor', limit: 1 })
      .expect(200);

    expect(orderResponse.body.id).toBeGreaterThan(0);
    expect(publishResult.processed).toBe(1);
    expect(offsetActivityResponse.body.items).toHaveLength(1);
    expect(offsetActivityResponse.body.pageInfo.pagination).toBe('offset');
    expect(cursorActivityResponse.body.items).toHaveLength(1);
    expect(cursorActivityResponse.body.pageInfo.pagination).toBe('cursor');
  });

  it('возвращает прежний заказ при повторе POST /orders с Idempotency-Key после timeout/retry клиента', async () => {
    const server = app.getHttpServer();
    const userResponse = await request(server)
      .post('/users')
      .send({
        email: 'retry-user@example.com',
        name: 'Retry User',
        avatarSeed: 'retry-seed',
      })
      .expect(201);
    const userId = userResponse.body.id as number;
    const mapResponse = await request(server)
      .post('/maps')
      .send({
        title: 'Retry Map',
        description: 'Map for idempotent order retry',
        latitude: 40.785091,
        longitude: -73.968285,
        ownerUserId: userId,
      })
      .expect(201);
    const mapId = mapResponse.body.id as number;
    const orderPayload = {
      userId,
      mapId,
      totalAmount: 49.9,
    };

    const firstResponse = await request(server)
      .post('/orders')
      .set('Idempotency-Key', 'e2e-order-timeout-retry')
      .send(orderPayload)
      .expect(201);
    const retryResponse = await request(server)
      .post('/orders')
      .set('Idempotency-Key', 'e2e-order-timeout-retry')
      .send(orderPayload)
      .expect(201);
    const userOrdersResponse = await request(server)
      .get(`/orders/users/${userId}`)
      .query({ limit: 20, offset: 0 })
      .expect(200);

    expect(retryResponse.body).toEqual(firstResponse.body);
    expect(userOrdersResponse.body).toHaveLength(1);
    expect(userOrdersResponse.body[0].id).toBe(firstResponse.body.id);
  });

  it('возвращает единый формат ошибки валидации', async () => {
    await request(app.getHttpServer())
      .post('/users')
      .set('x-request-id', 'e2e-validation')
      .send({
        email: 'not-email',
        name: 'User',
        extra: 'field',
      })
      .expect(400)
      .expect((response) => {
        expect(response.body).toEqual(
          expect.objectContaining({
            statusCode: 400,
            errorCode: 'VALIDATION_ERROR',
            path: '/users',
            method: 'POST',
            requestId: 'e2e-validation',
          }),
        );
        expect(response.body.details).toEqual(expect.any(Array));
      });
  });
});
