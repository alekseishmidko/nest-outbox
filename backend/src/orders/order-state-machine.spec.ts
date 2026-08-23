import { OrderStatus } from './dto/order-status.dto';
import { canTransitionOrderStatus } from './order-state-machine';

describe('order state machine', () => {
  it('allows business transitions and rejects terminal-state changes', () => {
    expect(
      canTransitionOrderStatus(OrderStatus.Pending, OrderStatus.Paid),
    ).toBe(true);
    expect(
      canTransitionOrderStatus(OrderStatus.Paid, OrderStatus.Completed),
    ).toBe(true);
    expect(
      canTransitionOrderStatus(OrderStatus.Completed, OrderStatus.Pending),
    ).toBe(false);
    expect(
      canTransitionOrderStatus(OrderStatus.Cancelled, OrderStatus.Paid),
    ).toBe(false);
  });

  it('allows a compensated failed order to resume from pending', () => {
    expect(
      canTransitionOrderStatus(OrderStatus.Failed, OrderStatus.Pending),
    ).toBe(true);
  });
});
