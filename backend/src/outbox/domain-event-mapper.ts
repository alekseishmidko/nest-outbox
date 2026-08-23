import { DomainEvent } from '../domain/events/domain-event';

/** Преобразует бизнес-событие в стабильный transport envelope Outbox. */
export function toOutboxEnvelope(event: DomainEvent): {
  eventType: string;
  aggregateType: string;
  aggregateId: number;
  payload: Record<string, unknown>;
} {
  const eventTypes: Record<DomainEvent['name'], string> = {
    OrderCreated: 'order.created',
    OrderStatusChanged: 'order.status_changed',
    MediaGenerated: 'media.generated',
  };

  return {
    eventType: eventTypes[event.name],
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    payload: event.payload,
  };
}
