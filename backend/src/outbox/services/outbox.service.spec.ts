import { NotFoundException } from '@nestjs/common';

jest.mock('../handlers/order-created-outbox.handler', () => ({
  OrderCreatedOutboxHandler: class OrderCreatedOutboxHandler {},
}));

import { OutboxEventStatus } from '../dto/outbox-event-status.dto';
import type { OrderCreatedOutboxHandler } from '../handlers/order-created-outbox.handler';
import { OutboxRepository } from '../repositories/outbox.repository';
import { OutboxEventRecord } from '../types/outbox-event-record.type';
import { ProcessedEventReservationResult } from '../types/processed-event-reservation-result.type';
import { OutboxService } from './outbox.service';

describe('OutboxService', () => {
  const event: OutboxEventRecord = {
    id: 1,
    eventType: 'order.created',
    aggregateType: 'order',
    aggregateId: 10,
    payload: {
      orderId: 10,
      userId: 20,
      mapId: 30,
    },
    status: OutboxEventStatus.Pending,
    attempts: 0,
    nextRetryAt: null,
    processedAt: null,
    error: null,
    manualRetryReason: null,
    createdAt: new Date(),
  };

  it('возвращает 404, если событие не найдено', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(null),
    };
    const service = new OutboxService(
      repository as unknown as OutboxRepository,
      {} as unknown as OrderCreatedOutboxHandler,
    );

    await expect(service.findById(404)).rejects.toThrow(NotFoundException);
  });

  it('передает order.created событие в handler', async () => {
    const repository = {
      reserveProcessedEvent: jest
        .fn()
        .mockResolvedValue(ProcessedEventReservationResult.Reserved),
      markProcessedEvent: jest.fn().mockResolvedValue(undefined),
      releaseProcessedEventReservation: jest.fn(),
    };
    const handler = {
      handle: jest.fn().mockResolvedValue(undefined),
    };
    const service = new OutboxService(
      repository as unknown as OutboxRepository,
      handler as unknown as OrderCreatedOutboxHandler,
    );

    await service.handleEvent(event);

    expect(repository.reserveProcessedEvent).toHaveBeenCalledWith(
      event,
      'order.created:order:10',
    );
    expect(handler.handle).toHaveBeenCalledWith(event);
    expect(repository.markProcessedEvent).toHaveBeenCalledWith(
      'order.created:order:10',
    );
  });

  it('игнорирует событие, если idempotency key уже обработан', async () => {
    const repository = {
      reserveProcessedEvent: jest
        .fn()
        .mockResolvedValue(ProcessedEventReservationResult.AlreadyProcessed),
      markProcessedEvent: jest.fn(),
      releaseProcessedEventReservation: jest.fn(),
    };
    const handler = {
      handle: jest.fn(),
    };
    const service = new OutboxService(
      repository as unknown as OutboxRepository,
      handler as unknown as OrderCreatedOutboxHandler,
    );

    await service.handleEvent(event);

    expect(handler.handle).not.toHaveBeenCalled();
    expect(repository.markProcessedEvent).not.toHaveBeenCalled();
  });

  it('освобождает reservation при ошибке handler-а', async () => {
    const repository = {
      reserveProcessedEvent: jest
        .fn()
        .mockResolvedValue(ProcessedEventReservationResult.Reserved),
      markProcessedEvent: jest.fn(),
      releaseProcessedEventReservation: jest.fn().mockResolvedValue(undefined),
    };
    const handler = {
      handle: jest.fn().mockRejectedValue(new Error('media failed')),
    };
    const service = new OutboxService(
      repository as unknown as OutboxRepository,
      handler as unknown as OrderCreatedOutboxHandler,
    );

    await expect(service.handleEvent(event)).rejects.toThrow('media failed');
    expect(repository.releaseProcessedEventReservation).toHaveBeenCalledWith(
      'order.created:order:10',
    );
  });
});
