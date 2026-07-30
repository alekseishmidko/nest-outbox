import { Injectable, NotFoundException } from '@nestjs/common';
import { ListOutboxEventsQueryDto } from '../dto/list-outbox-events-query.dto';
import { OrderCreatedOutboxHandler } from '../handlers/order-created-outbox.handler';
import { OutboxRepository } from '../repositories/outbox.repository';
import { OutboxEventRecord } from '../types/outbox-event-record.type';

/**
 * Сервис Outbox.
 */
@Injectable()
export class OutboxService {
  constructor(
    private readonly outboxRepository: OutboxRepository,
    private readonly orderCreatedOutboxHandler: OrderCreatedOutboxHandler,
  ) {}

  findAll(query: ListOutboxEventsQueryDto): Promise<OutboxEventRecord[]> {
    return this.outboxRepository.findAll(query);
  }

  async findById(id: number): Promise<OutboxEventRecord> {
    const event = await this.outboxRepository.findById(id);

    if (!event) {
      throw new NotFoundException(`Outbox-событие ${id} не найдено`);
    }

    return event;
  }

  async retry(id: number): Promise<OutboxEventRecord> {
    const event = await this.outboxRepository.retry(id);

    if (!event) {
      throw new NotFoundException(`Outbox-событие ${id} не найдено`);
    }

    return event;
  }

  /**
   * Обрабатывает событие через зарегистрированный handler.
   *
   * Полноценный polling worker будет вызывать этот метод на следующем этапе.
   */
  async handleEvent(event: OutboxEventRecord): Promise<void> {
    if (event.eventType === 'order.created') {
      await this.orderCreatedOutboxHandler.handle(event);
    }
  }
}
