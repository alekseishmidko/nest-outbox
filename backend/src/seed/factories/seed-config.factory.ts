import { SeedConfig } from '../types/seed-config.type';

/**
 * Создает настройки seed-команды из env-переменных.
 */
export function createSeedConfig(): SeedConfig {
  return {
    usersCount: Number(process.env.SEED_USERS_COUNT ?? 100),
    mapsCount: Number(process.env.SEED_MAPS_COUNT ?? 100),
    ordersCount: Number(process.env.SEED_ORDERS_COUNT ?? 1000),
    outboxEventsCount: Number(process.env.SEED_OUTBOX_EVENTS_COUNT ?? 200),
    batchSize: Number(process.env.SEED_BATCH_SIZE ?? 200),
  };
}
