import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus } from '../dto/order-status.dto';
import { OrdersRepository } from '../repositories/orders.repository';
import { IdempotencyKeyConflictError } from '../types/idempotency-error.type';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  it('создает заказ после проверки пользователя и карты', async () => {
    const order = {
      id: 1,
      userId: 10,
      mapId: 20,
      status: OrderStatus.Pending,
      totalAmount: '99.90',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const repository = {
      createWithOutbox: jest.fn().mockResolvedValue(order),
    };
    const usersService = {
      findById: jest.fn().mockResolvedValue({ id: 10 }),
    };
    const mapsService = {
      findById: jest.fn().mockResolvedValue({ id: 20 }),
    };
    const service = new OrdersService(
      repository as unknown as OrdersRepository,
      usersService as never,
      mapsService as never,
    );

    await expect(
      service.create({
        userId: 10,
        mapId: 20,
        totalAmount: 99.9,
      }),
    ).resolves.toEqual(order);

    expect(usersService.findById).toHaveBeenCalledWith(10);
    expect(mapsService.findById).toHaveBeenCalledWith(20);
    expect(repository.createWithOutbox).toHaveBeenCalledWith(
      {
        userId: 10,
        mapId: 20,
        totalAmount: 99.9,
      },
      undefined,
    );
  });

  it('передает нормализованный Idempotency-Key в repository', async () => {
    const order = {
      id: 1,
      userId: 10,
      mapId: 20,
      status: OrderStatus.Pending,
      totalAmount: '99.90',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const repository = {
      createWithOutbox: jest.fn().mockResolvedValue(order),
    };
    const usersService = {
      findById: jest.fn().mockResolvedValue({ id: 10 }),
    };
    const mapsService = {
      findById: jest.fn().mockResolvedValue({ id: 20 }),
    };
    const service = new OrdersService(
      repository as unknown as OrdersRepository,
      usersService as never,
      mapsService as never,
    );

    await service.create(
      {
        userId: 10,
        mapId: 20,
        totalAmount: 99.9,
      },
      ' retry-key ',
    );

    expect(repository.createWithOutbox).toHaveBeenCalledWith(
      {
        userId: 10,
        mapId: 20,
        totalAmount: 99.9,
      },
      'retry-key',
    );
  });

  it('возвращает 400 для слишком длинного Idempotency-Key', async () => {
    const service = new OrdersService(
      {} as unknown as OrdersRepository,
      {} as never,
      {} as never,
    );

    await expect(
      service.create(
        {
          userId: 10,
          mapId: 20,
          totalAmount: 99.9,
        },
        'x'.repeat(256),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('возвращает 409 при конфликте Idempotency-Key', async () => {
    const repository = {
      createWithOutbox: jest
        .fn()
        .mockRejectedValue(new IdempotencyKeyConflictError()),
    };
    const usersService = {
      findById: jest.fn().mockResolvedValue({ id: 10 }),
    };
    const mapsService = {
      findById: jest.fn().mockResolvedValue({ id: 20 }),
    };
    const service = new OrdersService(
      repository as unknown as OrdersRepository,
      usersService as never,
      mapsService as never,
    );

    await expect(
      service.create(
        {
          userId: 10,
          mapId: 20,
          totalAmount: 99.9,
        },
        'retry-key',
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('не создает заказ, если пользователь не найден', async () => {
    const repository = {
      createWithOutbox: jest.fn(),
    };
    const usersService = {
      findById: jest.fn().mockRejectedValue(new NotFoundException()),
    };
    const mapsService = {
      findById: jest.fn(),
    };
    const service = new OrdersService(
      repository as unknown as OrdersRepository,
      usersService as never,
      mapsService as never,
    );

    await expect(
      service.create({
        userId: 10,
        mapId: 20,
        totalAmount: 99.9,
      }),
    ).rejects.toThrow(NotFoundException);

    expect(mapsService.findById).not.toHaveBeenCalled();
    expect(repository.createWithOutbox).not.toHaveBeenCalled();
  });

  it('возвращает 404 при обновлении статуса отсутствующего заказа', async () => {
    const repository = {
      updateStatus: jest.fn().mockResolvedValue(null),
    };
    const service = new OrdersService(
      repository as unknown as OrdersRepository,
      {} as never,
      {} as never,
    );

    await expect(
      service.updateStatus(999, { status: OrderStatus.Completed }),
    ).rejects.toThrow(NotFoundException);
  });
});
