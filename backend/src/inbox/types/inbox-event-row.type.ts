import { RowDataPacket } from 'mysql2';
import { InboxEventStatus } from '../dto/inbox-event-status.dto';

/** Строка MySQL таблицы входящих событий. */
export type InboxEventRow = RowDataPacket & {
  id: number;
  event_id: string;
  event_type: string;
  payload: Record<string, unknown> | string;
  status: InboxEventStatus;
  attempts: number;
  next_retry_at: Date | null;
  processed_at: Date | null;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
};
