import { RowDataPacket } from 'mysql2';
import { OutboxEventStatus } from '../dto/outbox-event-status.dto';

/**
 * SQL-row таблицы `outbox_events` в snake_case формате MySQL.
 */
export type OutboxEventRow = RowDataPacket & {
  id: number;
  event_type: string;
  aggregate_type: string;
  aggregate_id: number;
  payload: string | object;
  status: OutboxEventStatus;
  attempts: number;
  next_retry_at: Date | null;
  processed_at: Date | null;
  error: string | null;
  created_at: Date;
};
