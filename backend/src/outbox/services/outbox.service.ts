import { Injectable, NotFoundException } from '@nestjs/common';
import { ListOutboxEventsQueryDto } from '../dto/list-outbox-events-query.dto';
import { OutboxRepository } from '../repositories/outbox.repository';
import { OutboxEventRecord } from '../types/outbox-event-record.type';

/**
 * Сервис Outbox.
 */
@Injectable()
export class OutboxService {
  constructor(private readonly outboxRepository: OutboxRepository) {}

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
}
