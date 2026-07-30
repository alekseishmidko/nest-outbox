/**
 * Результат одного прохода OutboxPublisher.
 */
export type OutboxPublishResult = {
  claimed: number;
  processed: number;
  failed: number;
};
