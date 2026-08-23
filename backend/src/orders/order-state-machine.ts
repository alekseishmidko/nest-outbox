import { OrderStatus } from './dto/order-status.dto';

const transitions: Record<OrderStatus, readonly OrderStatus[]> = {
  [OrderStatus.Pending]: [
    OrderStatus.Paid,
    OrderStatus.Completed,
    OrderStatus.Cancelled,
    OrderStatus.Failed,
  ],
  [OrderStatus.Paid]: [
    OrderStatus.Completed,
    OrderStatus.Cancelled,
    OrderStatus.Failed,
  ],
  [OrderStatus.Completed]: [],
  [OrderStatus.Cancelled]: [],
  [OrderStatus.Failed]: [OrderStatus.Pending, OrderStatus.Cancelled],
};

export function canTransitionOrderStatus(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return transitions[from].includes(to);
}

export function allowedOrderStatusTransitions(
  from: OrderStatus,
): readonly OrderStatus[] {
  return transitions[from];
}
