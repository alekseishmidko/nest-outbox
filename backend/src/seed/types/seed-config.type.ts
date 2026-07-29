/**
 * Настройки генерации seed-данных.
 */
export type SeedConfig = {
  usersCount: number;
  mapsCount: number;
  ordersCount: number;
  outboxEventsCount: number;
  batchSize: number;
};
