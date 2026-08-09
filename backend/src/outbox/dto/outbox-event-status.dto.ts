/**
 * Статусы Outbox-события.
 */
export enum OutboxEventStatus {
  Pending = 'pending',
  Processing = 'processing',
  Processed = 'processed',
  Failed = 'failed',
  DeadLetter = 'dead_letter',
}
