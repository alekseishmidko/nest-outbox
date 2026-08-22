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
  let authorization: string;
  let adminSequence = 0;

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

    const email = `e2e-admin-${adminSequence++}@example.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, name: 'E2E Admin', password: 'e2e-admin-password' })
      .expect(201);
    await kit.pool.execute('UPDATE users SET role = ? WHERE email = ?', [
      'admin',
      email,
    ]);
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'e2e-admin-password' })
      .expect(201);
    authorization = `Bearer ${loginResponse.body.accessToken as string}`;
  });

  it('создает пользователя, карту, заказ, генерирует медиа и обрабатывает Outbox', async () => {
    const server = app.getHttpServer();
    const userResponse = await request(server)
      .post('/users')
      .set('Authorization', authorization)
      .send({
        email: 'e2e-user@example.com',
        name: 'E2E User',
        avatarSeed: 'e2e-seed',
      })
      .expect(201);
    const userId = userResponse.body.id as number;
    const mapResponse = await request(server)
      .post('/maps')
      .set('Authorization', authorization)
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
      .set('Authorization', authorization)
      .send({
        userId,
        mapId,
        totalAmount: 49.9,
      })
      .expect(201);

    await request(server)
      .post(`/media/users/${userId}/avatar`)
      .set('Authorization', authorization)
      .send({})
      .expect(201);
    await request(server)
      .post(`/media/maps/${mapId}/qr`)
      .set('Authorization', authorization)
      .send({ payload: 'payload' })
      .expect(201);

    const pendingEventsResponse = await request(server)
      .get('/outbox/events')
      .set('Authorization', authorization)
      .query({ status: OutboxEventStatus.Pending, limit: 10, offset: 0 })
      .expect(200);
    const eventId = pendingEventsResponse.body[0].id as number;
    const publisher = app.get(OutboxPublisher);
    const publishResult = await publisher.processDueBatch();

    await request(server)
      .get(`/outbox/events/${eventId}`)
      .set('Authorization', authorization)
      .expect(200)
      .expect((response) => {
        expect(response.body.status).toBe(OutboxEventStatus.Processed);
      });
    const offsetActivityResponse = await request(server)
      .get(`/users/${userId}/activity`)
      .set('Authorization', authorization)
      .query({ pagination: 'offset', limit: 1, offset: 0 })
      .expect(200);
    const cursorActivityResponse = await request(server)
      .get(`/users/${userId}/activity`)
      .set('Authorization', authorization)
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
      .set('Authorization', authorization)
      .send({
        email: 'retry-user@example.com',
        name: 'Retry User',
        avatarSeed: 'retry-seed',
      })
      .expect(201);
    const userId = userResponse.body.id as number;
    const mapResponse = await request(server)
      .post('/maps')
      .set('Authorization', authorization)
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
      .set('Authorization', authorization)
      .set('Idempotency-Key', 'e2e-order-timeout-retry')
      .send(orderPayload)
      .expect(201);
    const retryResponse = await request(server)
      .post('/orders')
      .set('Authorization', authorization)
      .set('Idempotency-Key', 'e2e-order-timeout-retry')
      .send(orderPayload)
      .expect(201);
    const userOrdersResponse = await request(server)
      .get(`/orders/users/${userId}`)
      .set('Authorization', authorization)
      .query({ limit: 20, offset: 0 })
      .expect(200);

    expect(retryResponse.body).toEqual(firstResponse.body);
    expect(userOrdersResponse.body).toHaveLength(1);
    expect(userOrdersResponse.body[0].id).toBe(firstResponse.body.id);
  });

  it('возвращает единый формат ошибки валидации', async () => {
    await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', authorization)
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

  it('сохраняет контракты CQRS-маршрутов orders overview/status и users activity', async () => {
    const server = app.getHttpServer();
    const user = await request(server)
      .post('/users')
      .set('Authorization', authorization)
      .send({ email: 'cqrs-e2e@example.com', name: 'CQRS E2E' })
      .expect(201);
    const map = await request(server)
      .post('/maps')
      .set('Authorization', authorization)
      .send({
        title: 'CQRS map',
        latitude: 10,
        longitude: 20,
        ownerUserId: user.body.id,
      })
      .expect(201);
    const order = await request(server)
      .post('/orders')
      .set('Authorization', authorization)
      .send({ userId: user.body.id, mapId: map.body.id, totalAmount: 15 })
      .expect(201);

    await request(server)
      .get('/orders/reports/overview')
      .set('Authorization', authorization)
      .query({ limit: 1, offset: 0 })
      .expect(200)
      .expect((response) =>
        expect(response.body[0].orderId).toBe(order.body.id),
      );
    const updated = await request(server)
      .patch(`/orders/${order.body.id}/status`)
      .set('Authorization', authorization)
      .send({ status: 'paid', version: order.body.version })
      .expect(200);
    expect(updated.body.status).toBe('paid');
    await request(server)
      .get(`/users/${user.body.id}/activity`)
      .set('Authorization', authorization)
      .query({ pagination: 'offset', limit: 1, offset: 0 })
      .expect(200)
      .expect((response) =>
        expect(response.body.pageInfo.pagination).toBe('offset'),
      );
  });

  it('возвращает 409 одному из конкурентных optimistic updates', async () => {
    const server = app.getHttpServer();
    const user = await request(server)
      .post('/users')
      .set('Authorization', authorization)
      .send({
        email: 'optimistic-e2e@example.com',
        name: 'Optimistic E2E',
        avatarSeed: 'optimistic-e2e',
      });
    const map = await request(server)
      .post('/maps')
      .set('Authorization', authorization)
      .send({
        title: 'Optimistic E2E map',
        latitude: 10,
        longitude: 20,
        ownerUserId: user.body.id,
      });
    const order = await request(server)
      .post('/orders')
      .set('Authorization', authorization)
      .send({
        userId: user.body.id,
        mapId: map.body.id,
        totalAmount: 50,
      });
    const payload = { status: 'paid', version: order.body.version };

    const responses = await Promise.all([
      request(server)
        .patch(`/orders/${order.body.id}/status`)
        .set('Authorization', authorization)
        .send(payload),
      request(server)
        .patch(`/orders/${order.body.id}/status`)
        .set('Authorization', authorization)
        .send(payload),
    ]);
    const statuses = responses.map((response) => response.status).sort();

    expect(statuses).toEqual([200, 409]);
    expect(
      responses.find((response) => response.status === 409)?.body.message,
    ).toContain('устарела');
  });

  it('считает расстояние, nearby и direct route через routes API', async () => {
    const server = app.getHttpServer();
    const user = await request(server)
      .post('/users')
      .set('Authorization', authorization)
      .send({
        email: 'routes-e2e@example.com',
        name: 'Routes E2E',
        avatarSeed: 'routes-e2e',
      })
      .expect(201);
    const origin = await request(server)
      .post('/maps')
      .set('Authorization', authorization)
      .send({
        title: 'Origin',
        latitude: 10,
        longitude: 20,
        ownerUserId: user.body.id,
      })
      .expect(201);
    const destination = await request(server)
      .post('/maps')
      .set('Authorization', authorization)
      .send({
        title: 'Destination',
        latitude: 10.1,
        longitude: 20.1,
        ownerUserId: user.body.id,
      })
      .expect(201);

    await request(server)
      .post('/routes/distance')
      .send({
        origin: { latitude: 10, longitude: 20 },
        destination: { latitude: 10.1, longitude: 20.1 },
      })
      .expect(201)
      .expect((response) =>
        expect(response.body.distanceKm).toBeGreaterThan(0),
      );
    await request(server)
      .get('/routes/nearby')
      .query({ latitude: 10, longitude: 20, radiusKm: 20, limit: 10 })
      .expect(200)
      .expect((response) => expect(response.body).toHaveLength(2));
    await request(server)
      .post('/routes/search')
      .send({
        originMapId: origin.body.id,
        destinationMapId: destination.body.id,
        candidateRadiusKm: 20,
        limit: 10,
      })
      .expect(201)
      .expect((response) => {
        expect(response.body.strategy).toBe('direct_geodesic_with_candidates');
        expect(response.body.directDistanceKm).toBeGreaterThan(0);
      });
  });
});
