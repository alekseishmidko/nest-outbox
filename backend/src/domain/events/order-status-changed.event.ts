import { OrderStatus } from '../../orders/dto/order-status.dto';
import { DomainEvent } from './domain-event';

export class OrderStatusChanged {
  readonly name = 'OrderStatusChanged' as const;
  readonly aggregateType = 'order' as const;
  readonly occurredAt = new Date();

  constructor(
    readonly orderId: number,
    readonly from: OrderStatus,
    readonly to: OrderStatus,
    readonly version: number,
  ) {}

  toDomainEvent(): DomainEvent {
    return {
      name: this.name,
      aggregateType: this.aggregateType,
      aggregateId: this.orderId,
      occurredAt: this.occurredAt,
      payload: {
        orderId: this.orderId,
        from: this.from,
        to: this.to,
        version: this.version,
      },
    };
  }
}
