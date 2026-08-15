import { RowDataPacket } from 'mysql2';
import { Pool } from 'mysql2/promise';
import { MapsRepository } from '../maps/repositories/maps.repository';
import { MediaRepository } from '../media/repositories/media.repository';
import { OrdersRepository } from '../orders/repositories/orders.repository';
import { OrderStatus } from '../orders/dto/order-status.dto';
import { OptimisticLockConflictError } from '../orders/types/optimistic-lock-conflict.error';
import { OutboxEventStatus } from '../outbox/dto/outbox-event-status.dto';
import { OutboxRepository } from '../outbox/repositories/outbox.repository';
import { RoutesRepository } from '../routes/repositories/routes.repository';
import { UsersRepository } from '../users/repositories/users.repository';
import {
  createDatabaseTestKit,
  isDatabaseTestEnabled,
} from '../test-utils/database-test-kit';

const describeIntegration = isDatabaseTestEnabled('RUN_INTEGRATION_TESTS')
  ? describe
  : describe.skip;

describeIntegration('Repositories integration', () => {
  let kit: Awaited<ReturnType<typeof createDatabaseTestKit>>;
  let pool: Pool;
  let usersRepository: UsersRepository;
  let mapsRepository: MapsRepository;
  let ordersRepository: OrdersRepository;
  let mediaRepository: MediaRepository;
  let outboxRepository: OutboxRepository;
  let routesRepository: RoutesRepository;

  beforeAll(async () => {
    kit = await createDatabaseTestKit('repositories_integration');
    pool = kit.pool;
    usersRepository = new UsersRepository(pool);
    mapsRepository = new MapsRepository(pool);
    ordersRepository = new OrdersRepository(pool);
    mediaRepository = new MediaRepository(pool);
    outboxRepository = new OutboxRepository(pool);
    routesRepository = new RoutesRepository(pool);
  });

  beforeEach(async () => {
    await kit.resetTables();
  });

  afterAll(async () => {
    if (kit) {
      await kit.destroy();
    }
  });

  it('выполняет реальные SQL-запросы users, maps, orders, media и outbox', async () => {
    const user = await usersRepository.create({
      email: 'repo-user@example.com',
      name: 'Repo User',
      avatarSeed: 'repo-seed',
    });
    const map = await mapsRepository.create({
      title: 'Repo Map',
      description: 'Repository integration map',
      latitude: 40.785091,
      longitude: -73.968285,
      ownerUserId: user.id,
    });
    const order = await ordersRepository.createWithOutbox({
      userId: user.id,
      mapId: map.id,
      totalAmount: 199.9,
    });
    const avatarOwner = await mediaRepository.findUserForAvatar(user.id);
    const qrOwner = await mediaRepository.findMapForQr(map.id);
    const asset = await mediaRepository.createAsset({
      ownerType: 'user',
      ownerId: user.id,
      type: 'avatar',
      mimeType: 'image/svg+xml',
      storageType: 'database',
      contentBase64: Buffer.from('<svg />').toString('base64'),
      filePath: null,
      metadata: { source: 'integration' },
    });
    const outboxEvents = await outboxRepository.findAll({
      status: OutboxEventStatus.Pending,
      limit: 10,
      offset: 0,
    });

    expect(user.id).toBeGreaterThan(0);
    expect(map.ownerUserId).toBe(user.id);
    expect(order.status).toBe(OrderStatus.Pending);
    expect(avatarOwner?.avatar_seed).toBe('repo-seed');
    expect(qrOwner?.title).toBe('Repo Map');
    expect(asset.ownerId).toBe(user.id);
    expect(outboxEvents).toHaveLength(1);
    expect(outboxEvents[0]?.eventType).toBe('order.created');
  });

  it('откатывает все изменения при ошибке внутри транзакции', async () => {
    const user = await usersRepository.create({
      email: 'rollback-user@example.com',
      name: 'Rollback User',
      avatarSeed: 'rollback-seed',
    });
    const map = await mapsRepository.create({
      title: 'Rollback Map',
      latitude: 40.785091,
      longitude: -73.968285,
      ownerUserId: user.id,
    });
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      await connection.execute(
        `
          INSERT INTO orders (
            user_id,
            map_id,
            status,
            total_amount
          ) VALUES (?, ?, ?, ?)
        `,
        [user.id, map.id, OrderStatus.Pending, 777.77],
      );
      await expect(
        connection.execute(
          `
            INSERT INTO outbox_events (
              event_type,
              aggregate_type,
              aggregate_id,
              payload,
              status,
              attempts
            ) VALUES (?, ?, ?, ?, ?, ?)
          `,
          ['broken.event', 'order', 1, '{invalid-json', 'pending', 0],
        ),
      ).rejects.toThrow();
      await connection.rollback();
    } finally {
      connection.release();
    }

    const [rows] = await pool.query(
      'SELECT id FROM orders WHERE total_amount = ?',
      [777.77],
    );

    expect(rows).toEqual([]);
  });

  it('блокирует события при claim и не забирает их второй раз', async () => {
    const user = await usersRepository.create({
      email: 'claim-user@example.com',
      name: 'Claim User',
      avatarSeed: 'claim-seed',
    });
    const map = await mapsRepository.create({
      title: 'Claim Map',
      latitude: 40.785091,
      longitude: -73.968285,
      ownerUserId: user.id,
    });

    await ordersRepository.createWithOutbox({
      userId: user.id,
      mapId: map.id,
      totalAmount: 10,
    });

    const firstClaim = await outboxRepository.claimDueEvents(10);
    const secondClaim = await outboxRepository.claimDueEvents(10);

    expect(firstClaim).toHaveLength(1);
    expect(firstClaim[0]?.status).toBe(OutboxEventStatus.Processing);
    expect(secondClaim).toHaveLength(0);
  });

  it('повторяет транзакцию создания заказа после реального MySQL errno 1213', async () => {
    const { userId, mapId } = await createOrderDependencies('deadlock-retry');

    await pool.query(`
      CREATE TABLE deadlock_retry_probe (
        id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
        remaining_failures TINYINT UNSIGNED NOT NULL
      ) ENGINE = MEMORY;
      INSERT INTO deadlock_retry_probe VALUES (1, 1);
      CREATE TRIGGER orders_deadlock_once
      BEFORE INSERT ON orders
      FOR EACH ROW
      BEGIN
        IF (SELECT remaining_failures FROM deadlock_retry_probe WHERE id = 1) > 0 THEN
          UPDATE deadlock_retry_probe SET remaining_failures = 0 WHERE id = 1;
          SIGNAL SQLSTATE '40001'
            SET MYSQL_ERRNO = 1213, MESSAGE_TEXT = 'Deadlock found when trying to get lock';
        END IF;
      END
    `);

    try {
      const order = await ordersRepository.createWithOutbox({
        userId,
        mapId,
        totalAmount: 25,
      });
      const [probeRows] = await pool.query<
        Array<RowDataPacket & { remaining_failures: number }>
      >('SELECT remaining_failures FROM deadlock_retry_probe WHERE id = 1');

      expect(order.id).toBeGreaterThan(0);
      expect(probeRows[0]?.remaining_failures).toBe(0);
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS orders_deadlock_once');
      await pool.query('DROP TABLE IF EXISTS deadlock_retry_probe');
    }
  });

  it('обнаруживает конфликт optimistic locking по устаревшей version', async () => {
    const { userId, mapId } = await createOrderDependencies('optimistic');
    const order = await ordersRepository.createWithOutbox({
      userId,
      mapId,
      totalAmount: 30,
    });

    const updated = await ordersRepository.updateStatus(
      order.id,
      OrderStatus.Paid,
      order.version,
    );

    expect(updated?.version).toBe(order.version + 1);
    await expect(
      ordersRepository.updateStatus(
        order.id,
        OrderStatus.Cancelled,
        order.version,
      ),
    ).rejects.toBeInstanceOf(OptimisticLockConflictError);
  });

  it('SELECT FOR UPDATE удерживает row lock до завершения транзакции', async () => {
    const { userId, mapId } = await createOrderDependencies('pessimistic');
    const order = await ordersRepository.createWithOutbox({
      userId,
      mapId,
      totalAmount: 40,
    });
    const blocker = await pool.getConnection();

    try {
      await blocker.beginTransaction();
      await blocker.query('SELECT id FROM orders WHERE id = ? FOR UPDATE', [
        order.id,
      ]);

      let completed = false;
      const updatePromise = ordersRepository
        .updateStatusPessimistic(order.id, OrderStatus.Completed)
        .then((result) => {
          completed = true;
          return result;
        });

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(completed).toBe(false);

      await blocker.commit();
      const updated = await updatePromise;
      expect(updated?.status).toBe(OrderStatus.Completed);
      expect(updated?.version).toBe(order.version + 1);
    } finally {
      await blocker.rollback();
      blocker.release();
    }
  });

  it('находит ближайшие карты реальным ST_Distance_Sphere запросом', async () => {
    const user = await usersRepository.create({
      email: 'routes@example.com',
      name: 'Routes',
      avatarSeed: 'routes',
    });
    await mapsRepository.create({
      title: 'Near',
      latitude: 10.01,
      longitude: 20.01,
      ownerUserId: user.id,
    });
    await mapsRepository.create({
      title: 'Far',
      latitude: 20,
      longitude: 30,
      ownerUserId: user.id,
    });

    const nearby = await routesRepository.findNearby({
      latitude: 10,
      longitude: 20,
      radiusKm: 5,
      limit: 10,
    });

    expect(nearby.map((map) => map.title)).toEqual(['Near']);
    expect(nearby[0]?.distanceKm).toBeGreaterThan(0);
  });

  async function createOrderDependencies(prefix: string): Promise<{
    userId: number;
    mapId: number;
  }> {
    const user = await usersRepository.create({
      email: `${prefix}@example.com`,
      name: prefix,
      avatarSeed: prefix,
    });
    const map = await mapsRepository.create({
      title: `${prefix} map`,
      latitude: 10,
      longitude: 20,
      ownerUserId: user.id,
    });

    return { userId: user.id, mapId: map.id };
  }
});
