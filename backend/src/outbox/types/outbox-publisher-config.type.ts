/**
 * Настройки polling worker для OutboxPublisher.
 */
export type OutboxPublisherConfig = {
  pollIntervalMs: number;
  batchSize: number;
  maxAttempts: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  retryJitterMs: number;
  shutdownTimeoutMs: number;
  leaseDurationMs: number;
};
