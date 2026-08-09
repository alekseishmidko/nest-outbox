import { RowDataPacket } from 'mysql2';
import { OrderStatus } from '../../orders/dto/order-status.dto';

/**
 * Raw row отчета заказов.
 */
export type ReportOrderRow = RowDataPacket & {
  order_id: number;
  status: OrderStatus;
  total_amount: string;
  created_at: Date;
  user_id: number;
  user_email: string;
  map_id: number;
  map_title: string;
};
