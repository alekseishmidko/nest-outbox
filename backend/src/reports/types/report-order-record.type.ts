import { OrderStatus } from '../../orders/dto/order-status.dto';

/**
 * Строка отчета заказов для сравнения offset/cursor pagination.
 */
export type ReportOrderRecord = {
  orderId: number;
  status: OrderStatus;
  totalAmount: string;
  createdAt: Date;
  user: {
    id: number;
    email: string;
  };
  map: {
    id: number;
    title: string;
  };
};
