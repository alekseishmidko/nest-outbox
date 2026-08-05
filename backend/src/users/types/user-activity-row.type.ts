import { RowDataPacket } from 'mysql2';
import { OrderStatus } from '../../orders/dto/order-status.dto';

/**
 * SQL-row сложного JOIN-отчета пользователя.
 */
export type UserActivityRow = RowDataPacket & {
  user_id: number;
  user_email: string;
  user_name: string;
  order_id: number;
  order_status: OrderStatus;
  total_amount: string;
  order_created_at: Date;
  map_id: number;
  map_title: string;
  latitude: string;
  longitude: string;
  user_avatar_asset_id: number | null;
  user_avatar_mime_type: string | null;
  map_qr_asset_id: number | null;
  map_qr_mime_type: string | null;
};
