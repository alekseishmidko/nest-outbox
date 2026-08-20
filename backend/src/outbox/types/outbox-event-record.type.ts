import { OutboxEventStatus } from '../dto/outbox-event-status.dto';

/**
 * Доменное представление Outbox-события, которое возвращается из repository.
 */
export type OutboxEventRecord = {
  id: number;
  eventType: string;
  aggregateType: string;
  aggregateId: number;
  payload: unknown;
  status: OutboxEventStatus;
  attempts: number;
  nextRetryAt: Date | null;
  processedAt: Date | null;
  error: string | null;
  errorCode: string | null;
  errorStack: string | null;
  deadLetterReason: string | null;
  manualRetryReason: string | null;
  leaseOwner: string | null;
  leaseToken: string | null;
  leaseExpiresAt: Date | null;
  fencingToken: number;
  createdAt: Date;
};
