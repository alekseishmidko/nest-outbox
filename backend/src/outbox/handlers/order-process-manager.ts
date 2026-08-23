import { Injectable, Logger } from '@nestjs/common';
import { MediaService } from '../../media/services/media.service';
import { OrderSagaRepository } from '../../orders/sagas/order-saga.repository';
import { OutboxEventRecord } from '../types/outbox-event-record.type';
import { OrderCreatedPayload } from '../types/order-created-payload.type';

/** Process Manager/Saga для post-create workflow заказа. */
@Injectable()
export class OrderProcessManager {
  private readonly logger = new Logger(OrderProcessManager.name);

  constructor(
    private readonly sagaRepository: OrderSagaRepository,
    private readonly mediaService: MediaService,
  ) {}

  async handle(event: OutboxEventRecord): Promise<void> {
    const payload = this.parsePayload(event.payload);
    const state = await this.sagaRepository.startOrResume(payload.orderId);

    try {
      if (!state.completedStages.includes('avatar')) {
        await this.mediaService.generateUserAvatar(payload.userId);
        await this.sagaRepository.markStageCompleted(payload.orderId, 'avatar');
      }
      const refreshed = await this.sagaRepository.startOrResume(
        payload.orderId,
      );
      if (!refreshed.completedStages.includes('qr')) {
        await this.mediaService.generateMapQr(payload.mapId, {
          payload: JSON.stringify({
            type: 'order.created',
            orderId: payload.orderId,
            userId: payload.userId,
            mapId: payload.mapId,
          }),
        });
        await this.sagaRepository.markStageCompleted(payload.orderId, 'qr');
      }
      await this.sagaRepository.complete(payload.orderId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.sagaRepository.compensate(payload.orderId, message);
      this.logger.error(
        `Order saga ${payload.orderId} compensated: ${message}`,
      );
      throw error;
    }
  }

  private parsePayload(payload: unknown): OrderCreatedPayload {
    const parsed =
      typeof payload === 'string' ? (JSON.parse(payload) as unknown) : payload;
    if (!parsed || typeof parsed !== 'object')
      throw new Error('Invalid order.created payload');
    const candidate = parsed as Partial<OrderCreatedPayload>;
    if (
      typeof candidate.orderId !== 'number' ||
      typeof candidate.userId !== 'number' ||
      typeof candidate.mapId !== 'number'
    ) {
      throw new Error('Invalid order.created payload');
    }
    return candidate as OrderCreatedPayload;
  }
}
