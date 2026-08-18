import { InboxEventStatus } from '../dto/inbox-event-status.dto';

/** Доменная запись входящего события. */
export type InboxEventRecord = {
  id: number;
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: InboxEventStatus;
  attempts: number;
  nextRetryAt: Date | null;
  processedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};
