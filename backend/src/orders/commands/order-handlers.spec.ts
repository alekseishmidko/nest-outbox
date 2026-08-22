import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus } from '../dto/order-status.dto';
import { CreateOrderHandler } from './create-order.handler';
import { UpdateOrderStatusHandler } from './update-order-status.handler';
import { OptimisticLockConflictError } from '../types/optimistic-lock-conflict.error';

describe('order command handlers', () => {
  it('creates an order after validating its aggregates and normalizes idempotency key', async () => {
    const order = { id: 1 };
    const repository = { createWithOutbox: jest.fn().mockResolvedValue(order) };
    const users = { findById: jest.fn().mockResolvedValue({ id: 10 }) };
    const maps = { findById: jest.fn().mockResolvedValue({ id: 20 }) };
    const handler = new CreateOrderHandler(
      repository as never,
      users as never,
      maps as never,
    );

    await expect(
      handler.execute({ userId: 10, mapId: 20, totalAmount: 10 }, ' key '),
    ).resolves.toBe(order);
    expect(repository.createWithOutbox).toHaveBeenCalledWith(
      { userId: 10, mapId: 20, totalAmount: 10 },
      'key',
    );
  });

  it('rejects an oversized idempotency key before touching dependencies', async () => {
    const handler = new CreateOrderHandler(
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      handler.execute(
        { userId: 1, mapId: 1, totalAmount: 10 },
        'x'.repeat(256),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('maps status command conflicts and missing orders to HTTP exceptions', async () => {
    const conflictHandler = new UpdateOrderStatusHandler({
      updateStatus: jest
        .fn()
        .mockRejectedValue(new OptimisticLockConflictError(1, 0)),
    } as never);
    await expect(
      conflictHandler.execute(1, { status: OrderStatus.Completed, version: 0 }),
    ).rejects.toThrow(ConflictException);

    const missingHandler = new UpdateOrderStatusHandler({
      updateStatus: jest.fn().mockResolvedValue(null),
    } as never);
    await expect(
      missingHandler.execute(1, { status: OrderStatus.Completed, version: 0 }),
    ).rejects.toThrow(NotFoundException);
  });
});
