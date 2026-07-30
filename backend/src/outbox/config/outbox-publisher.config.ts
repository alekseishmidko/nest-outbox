import { z } from 'zod';
import { OutboxPublisherConfig } from '../types/outbox-publisher-config.type';

const outboxPublisherEnvSchema = z.object({
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().positive().max(100).default(10),
  OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  OUTBOX_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(1000),
});

/**
 * Возвращает настройки OutboxPublisher из env.
 */
export function parseOutboxPublisherConfig(): OutboxPublisherConfig {
  const env = outboxPublisherEnvSchema.parse(process.env);

  return {
    pollIntervalMs: env.OUTBOX_POLL_INTERVAL_MS,
    batchSize: env.OUTBOX_BATCH_SIZE,
    maxAttempts: env.OUTBOX_MAX_ATTEMPTS,
    retryBaseDelayMs: env.OUTBOX_RETRY_BASE_DELAY_MS,
  };
}
