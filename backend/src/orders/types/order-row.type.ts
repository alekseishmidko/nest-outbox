import { RowDataPacket } from 'mysql2';
import { OrderStatus } from '../dto/order-status.dto';

/**
 * SQL-row таблицы `orders` в snake_case формате MySQL.
 */
export type OrderRow = RowDataPacket & {
  id: number;
  user_id: number;
  map_id: number;
  status: OrderStatus;
  total_amount: string;
  version: number;
  created_at: Date;
  updated_at: Date;
};
