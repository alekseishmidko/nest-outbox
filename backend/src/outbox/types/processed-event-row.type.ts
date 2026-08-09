import { RowDataPacket } from 'mysql2';

/**
 * SQL-row таблицы `processed_events`.
 */
export type ProcessedEventRow = RowDataPacket & {
  id: number;
  idempotency_key: string;
  outbox_event_id: number;
  event_type: string;
  aggregate_type: string;
  aggregate_id: number;
  status: 'processing' | 'processed';
  processed_at: Date | null;
  created_at: Date;
};
