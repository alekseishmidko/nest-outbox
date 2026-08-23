jest.mock('@dicebear/core', () => ({
  createAvatar: jest.fn(() => ({ toString: () => '<svg />' })),
}));

jest.mock('@dicebear/collection', () => ({ identicon: {} }));

import { Pool } from 'mysql2/promise';
import { RowDataPacket } from 'mysql2';
import { OrderProcessManager } from '../../outbox/handlers/order-process-manager';
import { OrderSagaRepository } from './order-saga.repository';
import { OrdersRepository } from '../repositories/orders.repository';
import { MapsRepository } from '../../maps/repositories/maps.repository';
import { UsersRepository } from '../../users/repositories/users.repository';
import { OutboxEventRecord } from '../../outbox/types/outbox-event-record.type';
import { OutboxEventStatus } from '../../outbox/dto/outbox-event-status.dto';
import {
  createDatabaseTestKit,
  isDatabaseTestEnabled,
} from '../../test-utils/database-test-kit';

const describeIntegration = isDatabaseTestEnabled('RUN_INTEGRATION_TESTS')
  ? describe
  : describe.skip;

describeIntegration('OrderProcessManager SQL integration', () => {
  let kit: Awaited<ReturnType<typeof createDatabaseTestKit>>;
  let pool: Pool;
  let orderId: number;
  let event: OutboxEventRecord;

  beforeAll(async () => {
    kit = await createDatabaseTestKit('order_process_manager');
    pool = kit.pool;
  });

  beforeEach(async () => {
    await kit.resetTables();
    const users = new UsersRepository(pool);
    const maps = new MapsRepository(pool);
    const orders = new OrdersRepository(pool);
    const user = await users.create({
      email: 'saga-integration@example.com',
      name: 'Saga Integration',
      avatarSeed: 'saga-seed',
    });
    const map = await maps.create({
      title: 'Saga map',
      latitude: 10,
      longitude: 20,
      ownerUserId: user.id,
    });
    const order = await orders.createWithOutbox({
      userId: user.id,
      mapId: map.id,
      totalAmount: 10,
    });
    orderId = order.id;
    event = {
      id: 1,
      eventType: 'order.created',
      aggregateType: 'order',
      aggregateId: order.id,
      payload: { orderId: order.id, userId: user.id, mapId: map.id },
      status: OutboxEventStatus.Processing,
      attempts: 1,
      nextRetryAt: null,
      processedAt: null,
      error: null,
      errorCode: null,
      errorStack: null,
      deadLetterReason: null,
      manualRetryReason: null,
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
      fencingToken: 1,
      createdAt: new Date(),
    };
  });

  afterAll(async () => {
    if (kit) await kit.destroy();
  });

  it('compensates avatar failure and resumes the complete workflow', async () => {
    const media = {
      generateUserAvatar: jest
        .fn()
        .mockRejectedValueOnce(new Error('avatar provider down'))
        .mockResolvedValue(undefined),
      generateMapQr: jest.fn().mockResolvedValue(undefined),
    };
    const manager = new OrderProcessManager(
      new OrderSagaRepository(pool),
      media as never,
    );

    await expect(manager.handle(event)).rejects.toThrow('avatar provider down');
    await expectSagaState('failed', []);
    await manager.handle(event);

    expect(media.generateUserAvatar).toHaveBeenCalledTimes(2);
    expect(media.generateMapQr).toHaveBeenCalledTimes(1);
    await expectSagaState('completed', ['avatar', 'qr']);
  });

  it('keeps completed avatar stage and resumes only QR after QR failure', async () => {
    const media = {
      generateUserAvatar: jest.fn().mockResolvedValue(undefined),
      generateMapQr: jest
        .fn()
        .mockRejectedValueOnce(new Error('qr provider down'))
        .mockResolvedValue(undefined),
    };
    const manager = new OrderProcessManager(
      new OrderSagaRepository(pool),
      media as never,
    );

    await expect(manager.handle(event)).rejects.toThrow('qr provider down');
    await manager.handle(event);

    expect(media.generateUserAvatar).toHaveBeenCalledTimes(1);
    expect(media.generateMapQr).toHaveBeenCalledTimes(2);
    await expectSagaState('completed', ['avatar', 'qr']);
  });

  async function expectSagaState(
    status: string,
    completedStages: string[],
  ): Promise<void> {
    const [sagas] = await pool.query<
      Array<
        RowDataPacket & {
          status: string;
          completed_stages: string | string[];
        }
      >
    >('SELECT status, completed_stages FROM order_sagas WHERE order_id = ?', [
      orderId,
    ]);
    expect(sagas[0]?.status).toBe(status);
    const storedStages = sagas[0]?.completed_stages;
    const parsedStages =
      typeof storedStages === 'string'
        ? JSON.parse(storedStages)
        : (storedStages ?? []);
    expect(parsedStages).toEqual(completedStages);
  }
});
