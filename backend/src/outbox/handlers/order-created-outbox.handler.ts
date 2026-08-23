import { Injectable } from '@nestjs/common';
import { OrderProcessManager } from './order-process-manager';
import { OutboxEventRecord } from '../types/outbox-event-record.type';

/**
 * Infrastructure adapter: routes the Outbox envelope to the domain process manager.
 */
@Injectable()
export class OrderCreatedOutboxHandler {
  constructor(private readonly processManager: OrderProcessManager) {}

  /**
   * Обрабатывает событие `order.created`.
   */
  async handle(event: OutboxEventRecord): Promise<void> {
    await this.processManager.handle(event);
  }
}
