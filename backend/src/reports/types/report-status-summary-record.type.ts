import { OrderStatus } from '../../orders/dto/order-status.dto';

/**
 * Агрегированная статистика заказов по статусу.
 */
export type ReportStatusSummaryRecord = {
  status: OrderStatus;
  ordersCount: number;
  totalAmountSum: string;
  averageOrderAmount: string | null;
  minOrderAmount: string | null;
  maxOrderAmount: string | null;
};
