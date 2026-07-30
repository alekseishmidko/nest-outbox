import { Injectable, Logger } from '@nestjs/common';
import { MediaService } from '../../media/services/media.service';
import { OutboxEventRecord } from '../types/outbox-event-record.type';
import { OrderCreatedPayload } from '../types/order-created-payload.type';

/**
 * Обработчик Outbox-события `order.created`.
 *
 * Генерирует avatar пользователя и QR-code карты на основе данных заказа.
 */
@Injectable()
export class OrderCreatedOutboxHandler {
  private readonly logger = new Logger(OrderCreatedOutboxHandler.name);

  constructor(private readonly mediaService: MediaService) {}

  /**
   * Обрабатывает событие `order.created`.
   */
  async handle(event: OutboxEventRecord): Promise<void> {
    const payload = this.parsePayload(event.payload);

    this.logger.log(
      `Handle order.created: eventId=${event.id}, orderId=${payload.orderId}, userId=${payload.userId}, mapId=${payload.mapId}`,
    );

    await this.mediaService.generateUserAvatar(payload.userId);
    await this.mediaService.generateMapQr(payload.mapId, {
      payload: JSON.stringify({
        type: 'order.created',
        orderId: payload.orderId,
        userId: payload.userId,
        mapId: payload.mapId,
      }),
    });
  }

  private parsePayload(payload: unknown): OrderCreatedPayload {
    const parsed =
      typeof payload === 'string' ? (JSON.parse(payload) as unknown) : payload;

    if (!this.isOrderCreatedPayload(parsed)) {
      throw new Error('Invalid order.created payload');
    }

    return parsed;
  }

  private isOrderCreatedPayload(
    payload: unknown,
  ): payload is OrderCreatedPayload {
    if (!payload || typeof payload !== 'object') {
      return false;
    }

    const candidate = payload as Partial<OrderCreatedPayload>;

    return (
      typeof candidate.orderId === 'number' &&
      typeof candidate.userId === 'number' &&
      typeof candidate.mapId === 'number'
    );
  }
}
