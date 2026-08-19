import { Pool } from 'mysql2/promise';
import { UnitOfWork } from './unit-of-work';
import { MapsRepository } from '../maps/repositories/maps.repository';
import { UsersRepository } from '../users/repositories/users.repository';
import {
  createDatabaseTestKit,
  isDatabaseTestEnabled,
} from '../test-utils/database-test-kit';

const describeIntegration = isDatabaseTestEnabled('RUN_INTEGRATION_TESTS')
  ? describe
  : describe.skip;

describeIntegration('UnitOfWork integration', () => {
  let kit: Awaited<ReturnType<typeof createDatabaseTestKit>>;
  let pool: Pool;
  let unitOfWork: UnitOfWork;
  let usersRepository: UsersRepository;
  let mapsRepository: MapsRepository;

  beforeAll(async () => {
    kit = await createDatabaseTestKit('unit_of_work');
    pool = kit.pool;
    unitOfWork = new UnitOfWork(pool);
    usersRepository = new UsersRepository(pool);
    mapsRepository = new MapsRepository(pool);
  });

  beforeEach(async () => {
    await kit.resetTables();
  });

  afterAll(async () => {
    await kit?.destroy();
  });

  it('откатывает пользователя, если второй repository завершился ошибкой', async () => {
    await expect(
      unitOfWork.run(async (connection) => {
        const user = await usersRepository.createInTransaction(connection, {
          email: 'unit-of-work@example.com',
          name: 'Unit Of Work',
        });
        await mapsRepository.createInTransaction(connection, {
          title: 'Broken map',
          latitude: 40,
          longitude: -73,
          ownerUserId: user.id + 999999,
        });
      }),
    ).rejects.toThrow();

    const [rows] = await pool.query('SELECT id FROM users WHERE email = ?', [
      'unit-of-work@example.com',
    ]);
    expect(rows).toEqual([]);
  });
});
