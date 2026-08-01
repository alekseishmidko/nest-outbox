import { OutboxEventStatus } from '../dto/outbox-event-status.dto';

/**
 * Количество Outbox-событий в конкретном статусе.
 */
export type OutboxStatusCount = {
  status: OutboxEventStatus;
  count: number;
};
