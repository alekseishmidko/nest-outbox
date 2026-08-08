import { RowDataPacket } from 'mysql2';
import { OrderStatus } from '../../orders/dto/order-status.dto';

/**
 * Raw row агрегированной статистики заказов по статусу.
 */
export type ReportStatusSummaryRow = RowDataPacket & {
  status: OrderStatus;
  orders_count: number;
  total_amount_sum: string;
  average_order_amount: string | null;
  min_order_amount: string | null;
  max_order_amount: string | null;
};
