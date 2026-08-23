export type DomainEventName =
  'OrderCreated' | 'OrderStatusChanged' | 'MediaGenerated';

export type DomainEvent = {
  name: DomainEventName;
  aggregateType: 'order' | 'media';
  aggregateId: number;
  occurredAt: Date;
  payload: Record<string, unknown>;
};
