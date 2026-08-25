import { Pool } from 'mysql2/promise';
import { RowDataPacket } from 'mysql2';
import { AuditLogRepository } from './audit-log.repository';
import { runWithObservabilityContext } from '../common/observability/observability-context';
import {
  createDatabaseTestKit,
  isDatabaseTestEnabled,
} from '../test-utils/database-test-kit';
import { UsersRepository } from '../users/repositories/users.repository';
import { MapsRepository } from '../maps/repositories/maps.repository';
import { OrdersRepository } from '../orders/repositories/orders.repository';
import { OrderStatus } from '../orders/dto/order-status.dto';

const describeIntegration = isDatabaseTestEnabled('RUN_INTEGRATION_TESTS')
  ? describe
  : describe.skip;

describeIntegration('Audit log and soft delete SQL integration', () => {
  let kit: Awaited<ReturnType<typeof createDatabaseTestKit>>;
  let pool: Pool;

  beforeAll(async () => {
    kit = await createDatabaseTestKit('audit_soft_delete');
    pool = kit.pool;
  });

  afterAll(async () => {
    if (kit) await kit.destroy();
  });

  it('audits status, ownership and role changes and restores access', async () => {
    await kit.resetTables();
    const audit = new AuditLogRepository(pool);
    const users = new UsersRepository(pool, audit);
    const maps = new MapsRepository(pool, audit);
    const orders = new OrdersRepository(pool, audit);
    const actor = await users.create({
      email: 'audit-actor@example.com',
      name: 'Actor',
    });
    const owner = await users.create({
      email: 'audit-owner@example.com',
      name: 'Owner',
    });
    const map = await maps.create({
      title: 'Audit map',
      latitude: 10,
      longitude: 20,
      ownerUserId: owner.id,
    });
    const order = await orders.createWithOutbox({
      userId: owner.id,
      mapId: map.id,
      totalAmount: 12,
    });

    await runWithObservabilityContext(
      { requestId: 'audit-request-1' },
      async () => {
        await maps.update(map.id, { ownerUserId: actor.id }, actor.id);
        await orders.updateStatus(order.id, OrderStatus.Paid, 0, actor.id);
        await users.updateRole(owner.id, 'admin', actor.id);
      },
    );

    const [auditRows] = await pool.query<
      Array<
        RowDataPacket & {
          action: string;
          request_id: string;
          before_json: string;
          after_json: string;
        }
      >
    >(
      'SELECT action, request_id, before_json, after_json FROM audit_log WHERE entity_id IN (?, ?, ?) ORDER BY id',
      [map.id, order.id, owner.id],
    );
    expect(auditRows.map((row) => row.action)).toEqual([
      'ownership_change',
      'status_change',
      'role_change',
    ]);
    expect(auditRows.every((row) => row.request_id === 'audit-request-1')).toBe(
      true,
    );
    expect(parseJson(auditRows[0]!.before_json)).toEqual({
      ownerUserId: owner.id,
    });
    expect(parseJson(auditRows[1]!.after_json)).toMatchObject({
      status: OrderStatus.Paid,
    });

    await users.delete(owner.id, actor.id);
    expect(await users.findById(owner.id)).toBeNull();
    expect(await users.findAll({ limit: 100, offset: 0 })).toHaveLength(1);
    expect((await maps.findById(map.id))?.id).toBe(map.id);

    await users.restore(owner.id, actor.id);
    expect((await users.findById(owner.id))?.id).toBe(owner.id);
    expect(
      (await users.findAll({ limit: 100, offset: 0 })).map((user) => user.id),
    ).toContain(owner.id);
  });

  function parseJson(value: string | object): unknown {
    return typeof value === 'string' ? JSON.parse(value) : value;
  }
});
