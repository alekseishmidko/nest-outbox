import { DomainEvent } from './domain-event';

export class OrderCreated {
  readonly name = 'OrderCreated' as const;
  readonly aggregateType = 'order' as const;
  readonly occurredAt = new Date();

  constructor(
    readonly orderId: number,
    readonly userId: number,
    readonly mapId: number,
    readonly totalAmount: number,
  ) {}

  toDomainEvent(): DomainEvent {
    return {
      name: this.name,
      aggregateType: this.aggregateType,
      aggregateId: this.orderId,
      occurredAt: this.occurredAt,
      payload: {
        orderId: this.orderId,
        userId: this.userId,
        mapId: this.mapId,
        totalAmount: this.totalAmount,
      },
    };
  }
}
