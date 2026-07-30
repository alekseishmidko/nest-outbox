import { OrderStatus } from '../dto/order-status.dto';
import { OrdersRepository } from './orders.repository';

describe('OrdersRepository', () => {
  it('откатывает создание заказа, если outbox_events не записался', async () => {
    const connection = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      execute: jest
        .fn()
        .mockResolvedValueOnce([{ insertId: 123 }])
        .mockRejectedValueOnce(new Error('outbox insert failed')),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    };
    const pool = {
      getConnection: jest.fn().mockResolvedValue(connection),
    };
    const repository = new OrdersRepository(pool as never);

    await expect(
      repository.createWithOutbox({
        userId: 1,
        mapId: 2,
        totalAmount: 100,
      }),
    ).rejects.toThrow('outbox insert failed');

    expect(connection.beginTransaction).toHaveBeenCalled();
    expect(connection.execute.mock.calls[0][1]).toEqual([
      1,
      2,
      OrderStatus.Pending,
      100,
    ]);
    expect(connection.rollback).toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalled();
  });
});
