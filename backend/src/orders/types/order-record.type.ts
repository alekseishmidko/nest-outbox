import { OrderStatus } from '../dto/order-status.dto';

/**
 * Доменное представление заказа, которое возвращается из repository.
 */
export type OrderRecord = {
  id: number;
  userId: number;
  mapId: number;
  status: OrderStatus;
  totalAmount: string;
  createdAt: Date;
  updatedAt: Date;
};
