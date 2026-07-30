import { RowDataPacket } from 'mysql2';

/**
 * SQL-row таблицы `media_assets` в snake_case формате MySQL.
 */
export type MediaAssetRow = RowDataPacket & {
  id: number;
  owner_type: 'user' | 'map' | 'order';
  owner_id: number;
  type: 'qr_code' | 'avatar';
  mime_type: string;
  storage_type: 'database' | 'file' | 'external';
  content_base64: string | null;
  file_path: string | null;
  metadata: string | object | null;
  created_at: Date;
};
