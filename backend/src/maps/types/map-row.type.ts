import { RowDataPacket } from 'mysql2';

/**
 * SQL-row таблицы `maps` в snake_case формате MySQL.
 */
export type MapRow = RowDataPacket & {
  id: number;
  title: string;
  description: string | null;
  latitude: string;
  longitude: string;
  owner_user_id: number;
  created_at: Date;
  updated_at: Date;
};
