import { Injectable } from '@nestjs/common';
import {
  httpRequestDurationSeconds,
  httpRequestsTotal,
  metricsRegistry,
  outboxEventsByStatus,
  outboxFailedTotal,
  outboxProcessedTotal,
  outboxProcessingDurationSeconds,
} from '../collectors/prometheus-metrics';

/**
 * Сервис записи прикладных метрик.
 */
@Injectable()
export class MetricsService {
  /**
   * Возвращает метрики в формате Prometheus exposition.
   */
  getMetrics(): Promise<string> {
    return metricsRegistry.metrics();
  }

  /**
   * Возвращает Content-Type для `/metrics`.
   */
  getContentType(): string {
    return metricsRegistry.contentType;
  }

  /**
   * Записывает HTTP request count и latency.
   */
  observeHttpRequest(input: {
    method: string;
    route: string;
    statusCode: number;
    durationSeconds: number;
  }): void {
    const labels = {
      method: input.method,
      route: input.route,
      status_code: String(input.statusCode),
    };

    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, input.durationSeconds);
  }

  /**
   * Записывает успешную обработку Outbox-события.
   */
  observeOutboxProcessed(eventType: string, durationSeconds: number): void {
    outboxProcessedTotal.inc({ event_type: eventType });
    outboxProcessingDurationSeconds.observe(
      { event_type: eventType, result: 'processed' },
      durationSeconds,
    );
  }

  /**
   * Записывает ошибку обработки Outbox-события.
   */
  observeOutboxFailed(eventType: string, durationSeconds: number): void {
    outboxFailedTotal.inc({ event_type: eventType });
    outboxProcessingDurationSeconds.observe(
      { event_type: eventType, result: 'failed' },
      durationSeconds,
    );
  }

  /**
   * Обновляет gauge количества Outbox-событий по статусам.
   */
  setOutboxStatusCount(status: string, count: number): void {
    outboxEventsByStatus.set({ status }, count);
  }
}
