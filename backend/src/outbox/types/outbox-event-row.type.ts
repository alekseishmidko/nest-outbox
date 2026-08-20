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
  error_code: string | null;
  error_stack: string | null;
  dead_letter_reason: string | null;
  manual_retry_reason: string | null;
  lease_owner: string | null;
  lease_token: string | null;
  lease_expires_at: Date | null;
  fencing_token: number;
  created_at: Date;
};
