import { OutboxEventStatus } from '../dto/outbox-event-status.dto';
import { OutboxRepository } from './outbox.repository';

describe('OutboxRepository', () => {
  it('claimDueEvents блокирует строки через FOR UPDATE SKIP LOCKED и переводит их в processing', async () => {
    const row = {
      id: 1,
      event_type: 'order.created',
      aggregate_type: 'order',
      aggregate_id: 10,
      payload: JSON.stringify({ orderId: 10, userId: 20, mapId: 30 }),
      status: OutboxEventStatus.Pending,
      attempts: 0,
      next_retry_at: null,
      processed_at: null,
      error: null,
      created_at: new Date('2026-01-01T00:00:00.000Z'),
    };
    const connection = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest
        .fn()
        .mockResolvedValueOnce([[row]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    };
    const pool = {
      getConnection: jest.fn().mockResolvedValue(connection),
    };
    const repository = new OutboxRepository(pool as never);

    const events = await repository.claimDueEvents(5);

    expect(connection.beginTransaction).toHaveBeenCalled();
    expect(connection.query.mock.calls[0][0]).toContain(
      'FOR UPDATE SKIP LOCKED',
    );
    expect(connection.query.mock.calls[1][0]).toContain('status = ?');
    expect(connection.query.mock.calls[1][1]).toEqual([
      OutboxEventStatus.Processing,
      row.id,
    ]);
    expect(connection.commit).toHaveBeenCalled();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalled();
    expect(events[0]).toMatchObject({
      id: row.id,
      status: OutboxEventStatus.Processing,
      error: null,
    });
  });
});
