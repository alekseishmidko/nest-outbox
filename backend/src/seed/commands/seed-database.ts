import { faker } from '@faker-js/faker';
import { Pool } from 'mysql2/promise';
import { createCliPool } from '../../database/connections/create-cli-pool';
import { createSeedConfig } from '../factories/seed-config.factory';
import { SeedConfig } from '../types/seed-config.type';

type SeededIds = {
  userIds: number[];
  mapIds: number[];
  orderIds: number[];
};

/**
 * Заполняет БД тестовыми пользователями, картами, заказами и Outbox-событиями.
 */
async function seedDatabase(): Promise<void> {
  const pool = createCliPool();
  const config = createSeedConfig();

  try {
    console.log(
      `[seed] start users=${config.usersCount}, maps=${config.mapsCount}, orders=${config.ordersCount}, outboxEvents=${config.outboxEventsCount}`,
    );

    const userIds = await seedUsers(pool, config);
    const mapIds = await seedMaps(pool, config, userIds);
    const orderIds = await seedOrders(pool, config, userIds, mapIds);
    await seedOutboxEvents(pool, config, { userIds, mapIds, orderIds });

    console.log('[seed] done');
  } finally {
    await pool.end();
  }
}

async function seedUsers(pool: Pool, config: SeedConfig): Promise<number[]> {
  const ids: number[] = [];

  for (let offset = 0; offset < config.usersCount; offset += config.batchSize) {
    const size = Math.min(config.batchSize, config.usersCount - offset);
    const values = Array.from({ length: size }, (_, index) => {
      const sequence = offset + index + 1;
      const email = `seed.user.${sequence}@example.com`;

      return [email, faker.person.fullName(), faker.string.uuid()];
    });

    const placeholders = values.map(() => '(?, ?, ?)').join(', ');
    const [result] = await pool.execute(
      `
        INSERT INTO users (
          email,
          name,
          avatar_seed
        ) VALUES ${placeholders}
      `,
      values.flat(),
    );
    const insertId = Number('insertId' in result ? result.insertId : 0);

    for (let index = 0; index < size; index += 1) {
      ids.push(insertId + index);
    }

    console.log(`[seed] users inserted ${ids.length}/${config.usersCount}`);
  }

  return ids;
}

async function seedMaps(
  pool: Pool,
  config: SeedConfig,
  userIds: number[],
): Promise<number[]> {
  const ids: number[] = [];

  for (let offset = 0; offset < config.mapsCount; offset += config.batchSize) {
    const size = Math.min(config.batchSize, config.mapsCount - offset);
    const values = Array.from({ length: size }, () => [
      faker.location.streetAddress(),
      faker.lorem.sentence(),
      faker.location.latitude({ min: -80, max: 80, precision: 8 }),
      faker.location.longitude({ min: -170, max: 170, precision: 8 }),
      faker.helpers.arrayElement(userIds),
    ]);

    const placeholders = values.map(() => '(?, ?, ?, ?, ?)').join(', ');
    const [result] = await pool.execute(
      `
        INSERT INTO maps (
          title,
          description,
          latitude,
          longitude,
          owner_user_id
        ) VALUES ${placeholders}
      `,
      values.flat(),
    );
    const insertId = Number('insertId' in result ? result.insertId : 0);

    for (let index = 0; index < size; index += 1) {
      ids.push(insertId + index);
    }

    console.log(`[seed] maps inserted ${ids.length}/${config.mapsCount}`);
  }

  return ids;
}

async function seedOrders(
  pool: Pool,
  config: SeedConfig,
  userIds: number[],
  mapIds: number[],
): Promise<number[]> {
  const ids: number[] = [];
  const statuses = ['pending', 'paid', 'completed', 'cancelled', 'failed'];

  for (
    let offset = 0;
    offset < config.ordersCount;
    offset += config.batchSize
  ) {
    const size = Math.min(config.batchSize, config.ordersCount - offset);
    const values = Array.from({ length: size }, () => [
      faker.helpers.arrayElement(userIds),
      faker.helpers.arrayElement(mapIds),
      faker.helpers.arrayElement(statuses),
      faker.commerce.price({ min: 10, max: 500, dec: 2 }),
    ]);

    const placeholders = values.map(() => '(?, ?, ?, ?)').join(', ');
    const [result] = await pool.execute(
      `
        INSERT INTO orders (
          user_id,
          map_id,
          status,
          total_amount
        ) VALUES ${placeholders}
      `,
      values.flat(),
    );
    const insertId = Number('insertId' in result ? result.insertId : 0);

    for (let index = 0; index < size; index += 1) {
      ids.push(insertId + index);
    }

    console.log(`[seed] orders inserted ${ids.length}/${config.ordersCount}`);
  }

  return ids;
}

async function seedOutboxEvents(
  pool: Pool,
  config: SeedConfig,
  ids: SeededIds,
): Promise<void> {
  const statuses = ['pending', 'processed', 'failed'];

  for (
    let offset = 0;
    offset < config.outboxEventsCount;
    offset += config.batchSize
  ) {
    const size = Math.min(config.batchSize, config.outboxEventsCount - offset);
    const values = Array.from({ length: size }, () => {
      const orderId = faker.helpers.arrayElement(ids.orderIds);
      const userId = faker.helpers.arrayElement(ids.userIds);
      const mapId = faker.helpers.arrayElement(ids.mapIds);
      const status = faker.helpers.arrayElement(statuses);

      return [
        'order.created',
        'order',
        orderId,
        JSON.stringify({
          orderId,
          userId,
          mapId,
          source: 'seed',
        }),
        status,
        status === 'failed' ? faker.number.int({ min: 1, max: 5 }) : 0,
        status === 'processed' ? faker.date.recent({ days: 3 }) : null,
        status === 'failed' ? 'Seed generated failure for retry testing' : null,
      ];
    });

    const placeholders = values
      .map(() => '(?, ?, ?, ?, ?, ?, ?, ?)')
      .join(', ');
    await pool.execute(
      `
        INSERT INTO outbox_events (
          event_type,
          aggregate_type,
          aggregate_id,
          payload,
          status,
          attempts,
          processed_at,
          error
        ) VALUES ${placeholders}
      `,
      values.flat(),
    );

    console.log(
      `[seed] outbox_events inserted ${Math.min(
        offset + size,
        config.outboxEventsCount,
      )}/${config.outboxEventsCount}`,
    );
  }
}

seedDatabase().catch((error) => {
  console.error('[seed] failed');
  console.error(error);
  process.exit(1);
});
