import { OrderStatus } from '../dto/order-status.dto';
import { OrdersRepository } from './orders.repository';

describe('OrdersRepository', () => {
  it('возвращает отчет заказов с данными пользователя и карты', async () => {
    const createdAt = new Date('2026-08-02T10:00:00.000Z');
    const pool = {
      query: jest.fn().mockResolvedValue([
        [
          {
            order_id: 123,
            status: OrderStatus.Pending,
            total_amount: '99.90',
            created_at: createdAt,
            user_id: 1,
            user_email: 'user@example.com',
            user_name: 'Test User',
            map_id: 2,
            map_title: 'Central Park QR map',
            latitude: '40.785091',
            longitude: '-73.968285',
          },
        ],
      ]),
    };
    const repository = new OrdersRepository(pool as never);

    const result = await repository.findOverview({
      status: OrderStatus.Pending,
      limit: 20,
      offset: 0,
    });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('JOIN users'),
      [OrderStatus.Pending, 20, 0],
    );
    expect(result).toEqual([
      {
        orderId: 123,
        status: OrderStatus.Pending,
        totalAmount: '99.90',
        createdAt,
        user: {
          id: 1,
          email: 'user@example.com',
          name: 'Test User',
        },
        map: {
          id: 2,
          title: 'Central Park QR map',
          latitude: '40.785091',
          longitude: '-73.968285',
        },
      },
    ]);
  });

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
