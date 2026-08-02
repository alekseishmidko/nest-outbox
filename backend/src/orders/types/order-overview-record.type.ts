import { OrderStatus } from '../dto/order-status.dto';

/**
 * Доменное представление строки отчета по заказам.
 */
export type OrderOverviewRecord = {
  orderId: number;
  status: OrderStatus;
  totalAmount: string;
  createdAt: Date;
  user: {
    id: number;
    email: string;
    name: string;
  };
  map: {
    id: number;
    title: string;
    latitude: string;
    longitude: string;
  };
};
