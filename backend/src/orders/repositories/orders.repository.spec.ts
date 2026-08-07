import { createHash } from 'node:crypto';
import { OrderStatus } from '../dto/order-status.dto';
import { IdempotencyKeyConflictError } from '../types/idempotency-error.type';
import { IdempotencyKeyStatus } from '../types/idempotency-key-status.type';
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

  it('создает заказ, outbox и завершает Idempotency-Key в одной транзакции', async () => {
    const createdAt = new Date('2026-08-07T00:00:00.000Z');
    const updatedAt = new Date('2026-08-07T00:00:01.000Z');
    const connection = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      execute: jest
        .fn()
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ insertId: 123 }])
        .mockResolvedValueOnce([{}])
        .mockResolvedValueOnce([{}]),
      query: jest.fn().mockResolvedValueOnce([
        [
          {
            id: 123,
            user_id: 1,
            map_id: 2,
            status: OrderStatus.Pending,
            total_amount: '100.00',
            created_at: createdAt,
            updated_at: updatedAt,
          },
        ],
      ]),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    };
    const pool = {
      getConnection: jest.fn().mockResolvedValue(connection),
    };
    const repository = new OrdersRepository(pool as never);

    const result = await repository.createWithOutbox(
      {
        userId: 1,
        mapId: 2,
        totalAmount: 100,
      },
      'retry-key',
    );

    expect(result.id).toBe(123);
    expect(connection.execute.mock.calls[0][0]).toContain(
      'INSERT IGNORE INTO idempotency_keys',
    );
    expect(connection.execute.mock.calls[3][0]).toContain(
      'UPDATE idempotency_keys',
    );
    expect(connection.commit).toHaveBeenCalled();
    expect(connection.rollback).not.toHaveBeenCalled();
  });

  it('возвращает прежний результат при повторном Idempotency-Key и не создает второй заказ', async () => {
    const createdAt = '2026-08-07T00:00:00.000Z';
    const updatedAt = '2026-08-07T00:00:01.000Z';
    const dto = {
      userId: 1,
      mapId: 2,
      totalAmount: 100,
    };
    const connection = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      execute: jest.fn().mockResolvedValueOnce([{ affectedRows: 0 }]),
      query: jest.fn().mockResolvedValueOnce([
        [
          {
            id: 1,
            idempotency_key: 'retry-key',
            request_hash: createRequestHash(dto),
            status: IdempotencyKeyStatus.Completed,
            response_status_code: 201,
            response_body: JSON.stringify({
              id: 123,
              userId: 1,
              mapId: 2,
              status: OrderStatus.Pending,
              totalAmount: '100.00',
              createdAt,
              updatedAt,
            }),
            created_at: new Date(createdAt),
            updated_at: new Date(updatedAt),
          },
        ],
      ]),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    };
    const pool = {
      getConnection: jest.fn().mockResolvedValue(connection),
    };
    const repository = new OrdersRepository(pool as never);

    const result = await repository.createWithOutbox(dto, 'retry-key');

    expect(result).toEqual({
      id: 123,
      userId: 1,
      mapId: 2,
      status: OrderStatus.Pending,
      totalAmount: '100.00',
      createdAt: new Date(createdAt),
      updatedAt: new Date(updatedAt),
    });
    expect(connection.execute).toHaveBeenCalledTimes(1);
    expect(connection.execute.mock.calls[0][0]).not.toContain(
      'INSERT INTO orders',
    );
    expect(connection.commit).toHaveBeenCalled();
    expect(connection.rollback).not.toHaveBeenCalled();
  });

  it('отклоняет повторный Idempotency-Key с другим телом запроса', async () => {
    const dto = {
      userId: 1,
      mapId: 2,
      totalAmount: 100,
    };
    const connection = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      execute: jest.fn().mockResolvedValueOnce([{ affectedRows: 0 }]),
      query: jest.fn().mockResolvedValueOnce([
        [
          {
            id: 1,
            idempotency_key: 'retry-key',
            request_hash: createRequestHash({ ...dto, totalAmount: 200 }),
            status: IdempotencyKeyStatus.Completed,
            response_status_code: 201,
            response_body: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      ]),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    };
    const pool = {
      getConnection: jest.fn().mockResolvedValue(connection),
    };
    const repository = new OrdersRepository(pool as never);

    await expect(repository.createWithOutbox(dto, 'retry-key')).rejects.toThrow(
      IdempotencyKeyConflictError,
    );
    expect(connection.rollback).toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
  });
});

function createRequestHash(dto: {
  userId: number;
  mapId: number;
  totalAmount: number;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        userId: dto.userId,
        mapId: dto.mapId,
        totalAmount: dto.totalAmount,
      }),
    )
    .digest('hex');
}
