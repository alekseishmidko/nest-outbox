import { MediaGenerated } from './media-generated.event';
import { OrderCreated } from './order-created.event';
import { OrderStatusChanged } from './order-status-changed.event';
import { OrderStatus } from '../../orders/dto/order-status.dto';
import { toOutboxEnvelope } from '../../outbox/domain-event-mapper';

describe('domain events', () => {
  it('keeps business events separate from infrastructure event names', () => {
    const created = new OrderCreated(1, 2, 3, 10).toDomainEvent();
    const status = new OrderStatusChanged(
      1,
      OrderStatus.Pending,
      OrderStatus.Paid,
      1,
    ).toDomainEvent();
    const media = new MediaGenerated(9, 'user', 2, 'avatar').toDomainEvent();

    expect(created.name).toBe('OrderCreated');
    expect(toOutboxEnvelope(created).eventType).toBe('order.created');
    expect(toOutboxEnvelope(status).eventType).toBe('order.status_changed');
    expect(toOutboxEnvelope(media).eventType).toBe('media.generated');
  });
});
