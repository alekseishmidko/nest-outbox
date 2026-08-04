import { performance } from 'node:perf_hooks';
import { MapsRepository } from '../maps/repositories/maps.repository';
import { OrdersRepository } from '../orders/repositories/orders.repository';
import { UsersRepository } from '../users/repositories/users.repository';
import {
  createDatabaseTestKit,
  isDatabaseTestEnabled,
} from '../test-utils/database-test-kit';

const describePerformance = isDatabaseTestEnabled('RUN_PERFORMANCE_TESTS')
  ? describe
  : describe.skip;

describePerformance('Critical SQL performance', () => {
  let kit: Awaited<ReturnType<typeof createDatabaseTestKit>>;
  let usersRepository: UsersRepository;
  let mapsRepository: MapsRepository;
  let ordersRepository: OrdersRepository;

  beforeAll(async () => {
    kit = await createDatabaseTestKit('critical_queries_performance');
    usersRepository = new UsersRepository(kit.pool);
    mapsRepository = new MapsRepository(kit.pool);
    ordersRepository = new OrdersRepository(kit.pool);

    await seedCriticalQueryData();
  }, 30_000);

  afterAll(async () => {
    if (kit) {
      await kit.destroy();
    }
  });

  it('выполняет JOIN отчет заказов быстрее допустимого порога', async () => {
    const maxMs = Number(process.env.PERFORMANCE_JOIN_OVERVIEW_MAX_MS ?? 100);
    const startedAt = performance.now();

    const rows = await ordersRepository.findOverview({
      limit: 50,
      offset: 0,
    });

    const durationMs = performance.now() - startedAt;

    expect(rows).toHaveLength(50);
    expect(durationMs).toBeLessThan(maxMs);
  });

  async function seedCriticalQueryData(): Promise<void> {
    for (let index = 0; index < 60; index += 1) {
      const user = await usersRepository.create({
        email: `perf-${index}@example.com`,
        name: `Perf User ${index}`,
        avatarSeed: `perf-seed-${index}`,
      });
      const map = await mapsRepository.create({
        title: `Perf Map ${index}`,
        latitude: 40.785091,
        longitude: -73.968285,
        ownerUserId: user.id,
      });

      await ordersRepository.createWithOutbox({
        userId: user.id,
        mapId: map.id,
        totalAmount: index,
      });
    }
  }
});
