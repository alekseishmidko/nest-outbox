import { OrderStatus } from '../dto/order-status.dto';

export class InvalidOrderStatusTransitionError extends Error {
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
  ) {
    super(`Недопустимый переход статуса заказа: ${from} -> ${to}`);
    this.name = 'InvalidOrderStatusTransitionError';
  }
}
