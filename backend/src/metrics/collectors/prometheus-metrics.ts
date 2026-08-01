import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';

/**
 * Единый registry Prometheus-метрик приложения.
 */
export const metricsRegistry = new Registry();

collectDefaultMetrics({
  register: metricsRegistry,
  prefix: 'nest_outbox_',
});

/**
 * Счетчик HTTP-запросов.
 */
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Общее количество HTTP-запросов.',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [metricsRegistry],
});

/**
 * Гистограмма длительности HTTP-запросов.
 */
export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Длительность HTTP-запросов в секундах.',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

/**
 * Счетчик успешно обработанных Outbox-событий.
 */
export const outboxProcessedTotal = new Counter({
  name: 'outbox_processed_total',
  help: 'Количество успешно обработанных Outbox-событий.',
  labelNames: ['event_type'] as const,
  registers: [metricsRegistry],
});

/**
 * Счетчик ошибок обработки Outbox-событий.
 */
export const outboxFailedTotal = new Counter({
  name: 'outbox_failed_total',
  help: 'Количество ошибок обработки Outbox-событий.',
  labelNames: ['event_type'] as const,
  registers: [metricsRegistry],
});

/**
 * Гистограмма длительности обработки Outbox-событий.
 */
export const outboxProcessingDurationSeconds = new Histogram({
  name: 'outbox_processing_duration_seconds',
  help: 'Длительность обработки Outbox-событий в секундах.',
  labelNames: ['event_type', 'result'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [metricsRegistry],
});

/**
 * Gauge количества Outbox-событий по статусам.
 */
export const outboxEventsByStatus = new Gauge({
  name: 'outbox_events_by_status',
  help: 'Количество Outbox-событий в каждом статусе.',
  labelNames: ['status'] as const,
  registers: [metricsRegistry],
});

/**
 * Гистограмма длительности DB-запросов.
 */
export const dbQueryDurationSeconds = new Histogram({
  name: 'db_query_duration_seconds',
  help: 'Длительность SQL-запросов к MySQL в секундах.',
  labelNames: ['operation'] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [metricsRegistry],
});
