import { Pool } from 'mysql2/promise';
import { InboxEventStatus } from '../dto/inbox-event-status.dto';
import { InboxRepository } from './inbox.repository';
import {
  createDatabaseTestKit,
  isDatabaseTestEnabled,
} from '../../test-utils/database-test-kit';

const describeIntegration = isDatabaseTestEnabled('RUN_INTEGRATION_TESTS')
  ? describe
  : describe.skip;

describeIntegration('InboxRepository integration', () => {
  let kit: Awaited<ReturnType<typeof createDatabaseTestKit>>;
  let pool: Pool;
  let repository: InboxRepository;

  beforeAll(async () => {
    kit = await createDatabaseTestKit('inbox_repository');
    pool = kit.pool;
    repository = new InboxRepository(pool);
  });

  beforeEach(async () => {
    await kit.resetTables();
  });

  afterAll(async () => {
    await kit?.destroy();
  });

  it('обеспечивает идемпотентность повторной доставки event_id', async () => {
    const first = await repository.receive({
      eventId: 'provider-event-1',
      eventType: 'payment.completed',
      payload: { orderId: 1 },
    });
    const duplicate = await repository.receive({
      eventId: 'provider-event-1',
      eventType: 'payment.completed',
      payload: { orderId: 999 },
    });

    expect(first.created).toBe(true);
    expect(duplicate.created).toBe(false);
    expect(duplicate.record.id).toBe(first.record.id);
    expect(duplicate.record.payload).toEqual({ orderId: 1 });
  });

  it('конкурентно claim-ит событие только одним worker', async () => {
    await repository.receive({
      eventId: 'provider-event-2',
      eventType: 'payment.completed',
      payload: { orderId: 2 },
    });

    const [first, second] = await Promise.all([
      repository.claimDueEvents(1),
      repository.claimDueEvents(1),
    ]);

    expect([first.length, second.length].sort()).toEqual([0, 1]);
    expect(first[0]?.status ?? second[0]?.status).toBe(
      InboxEventStatus.Processing,
    );
  });
});
