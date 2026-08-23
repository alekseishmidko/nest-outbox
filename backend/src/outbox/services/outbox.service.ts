import { Injectable, NotFoundException } from '@nestjs/common';
import { ListOutboxEventsQueryDto } from '../dto/list-outbox-events-query.dto';
import { RetryOutboxEventDto } from '../dto/retry-outbox-event.dto';
import { OrderCreatedOutboxHandler } from '../handlers/order-created-outbox.handler';
import { OutboxRepository } from '../repositories/outbox.repository';
import { OutboxEventRecord } from '../types/outbox-event-record.type';
import { ProcessedEventReservationResult } from '../types/processed-event-reservation-result.type';

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

  async retry(
    id: number,
    dto: RetryOutboxEventDto,
  ): Promise<OutboxEventRecord> {
    const event = await this.outboxRepository.retry(id, dto.reason);

    if (!event) {
      throw new NotFoundException(`Outbox-событие ${id} не найдено`);
    }

    return event;
  }

  /** Административно возвращает dead-letter событие в pending. */
  async requeueDeadLetter(
    id: number,
    dto: RetryOutboxEventDto,
  ): Promise<OutboxEventRecord> {
    const event = await this.outboxRepository.requeueDeadLetter(id, dto.reason);
    if (!event) {
      throw new NotFoundException(
        `Dead-letter Outbox-событие ${id} не найдено`,
      );
    }
    return event;
  }

  /**
   * Обрабатывает событие через зарегистрированный handler.
   *
   * Idempotency key строится на бизнес-событии, а не на строке outbox. Это
   * защищает от повторной генерации side effects при дублях `order.created`.
   */
  async handleEvent(event: OutboxEventRecord): Promise<void> {
    const idempotencyKey = this.createHandlerIdempotencyKey(event);
    const reservation = await this.outboxRepository.reserveProcessedEvent(
      event,
      idempotencyKey,
    );

    if (reservation !== ProcessedEventReservationResult.Reserved) {
      return;
    }

    try {
      await this.dispatchEvent(event);
      await this.outboxRepository.markProcessedEvent(idempotencyKey);
    } catch (error) {
      await this.outboxRepository.releaseProcessedEventReservation(
        idempotencyKey,
      );
      throw error;
    }
  }

  /**
   * Вызывает конкретный handler по типу события.
   */
  private async dispatchEvent(event: OutboxEventRecord): Promise<void> {
    if (event.eventType === 'order.created') {
      await this.orderCreatedOutboxHandler.handle(event);
      return;
    }

    if (
      event.eventType === 'order.status_changed' ||
      event.eventType === 'media.generated'
    ) {
      // These events are durable domain-event facts. Their consumers can be added
      // independently; acknowledging them keeps the Outbox transport resumable.
      return;
    }

    throw new Error(`No Outbox handler registered for ${event.eventType}`);
  }

  /**
   * Создает ключ идемпотентности обработчика.
   */
  private createHandlerIdempotencyKey(event: OutboxEventRecord): string {
    return `${event.eventType}:${event.aggregateType}:${event.aggregateId}`;
  }
}
