import { z } from 'zod';

/** Настройки Inbox worker. */
export type InboxWorkerConfig = {
  pollIntervalMs: number;
  batchSize: number;
  maxAttempts: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
};

/** Читает настройки Inbox из переменных окружения. */
export function parseInboxWorkerConfig(): InboxWorkerConfig {
  const env = z
    .object({
      INBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
      INBOX_BATCH_SIZE: z.coerce.number().int().positive().max(100).default(10),
      INBOX_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
      INBOX_RETRY_BASE_DELAY_MS: z.coerce
        .number()
        .int()
        .positive()
        .default(1000),
      INBOX_RETRY_MAX_DELAY_MS: z.coerce
        .number()
        .int()
        .positive()
        .default(60000),
    })
    .parse(process.env);
  return {
    pollIntervalMs: env.INBOX_POLL_INTERVAL_MS,
    batchSize: env.INBOX_BATCH_SIZE,
    maxAttempts: env.INBOX_MAX_ATTEMPTS,
    retryBaseDelayMs: env.INBOX_RETRY_BASE_DELAY_MS,
    retryMaxDelayMs: env.INBOX_RETRY_MAX_DELAY_MS,
  };
}
