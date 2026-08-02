import { RowDataPacket } from 'mysql2';
import { OrderStatus } from '../dto/order-status.dto';

/**
 * SQL-row отчета по заказам с JOIN между `orders`, `users` и `maps`.
 */
export type OrderOverviewRow = RowDataPacket & {
  order_id: number;
  status: OrderStatus;
  total_amount: string;
  created_at: Date;
  user_id: number;
  user_email: string;
  user_name: string;
  map_id: number;
  map_title: string;
  latitude: string;
  longitude: string;
};
