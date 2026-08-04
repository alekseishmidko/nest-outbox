import { NotFoundException } from '@nestjs/common';

jest.mock('../handlers/order-created-outbox.handler', () => ({
  OrderCreatedOutboxHandler: class OrderCreatedOutboxHandler {},
}));

import { OutboxEventStatus } from '../dto/outbox-event-status.dto';
import type { OrderCreatedOutboxHandler } from '../handlers/order-created-outbox.handler';
import { OutboxRepository } from '../repositories/outbox.repository';
import { OutboxEventRecord } from '../types/outbox-event-record.type';
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
    const handler = {
      handle: jest.fn().mockResolvedValue(undefined),
    };
    const service = new OutboxService(
      {} as unknown as OutboxRepository,
      handler as unknown as OrderCreatedOutboxHandler,
    );

    await service.handleEvent(event);

    expect(handler.handle).toHaveBeenCalledWith(event);
  });

  it('игнорирует неизвестный тип события без бизнес-логики в worker', async () => {
    const handler = {
      handle: jest.fn(),
    };
    const service = new OutboxService(
      {} as unknown as OutboxRepository,
      handler as unknown as OrderCreatedOutboxHandler,
    );

    await service.handleEvent({
      ...event,
      eventType: 'unknown.event',
    });

    expect(handler.handle).not.toHaveBeenCalled();
  });
});
