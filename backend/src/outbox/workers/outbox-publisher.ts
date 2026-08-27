import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { runWithObservabilityContext } from '../../common/observability/observability-context';
import { MetricsService } from '../../metrics/services/metrics.service';
import { OutboxRepository } from '../repositories/outbox.repository';
import { OutboxService } from '../services/outbox.service';
import { OutboxEventRecord } from '../types/outbox-event-record.type';
import { OutboxPublishResult } from '../types/outbox-publish-result.type';
import { OutboxPublisherConfig } from '../types/outbox-publisher-config.type';
import { parseOutboxPublisherConfig } from '../config/outbox-publisher.config';

/**
 * Polling worker для паттерна Outbox.
 *
 * Читает события из таблицы `outbox_events`, блокирует их на время обработки
 * и переводит в финальные статусы без использования брокера сообщений.
 */
@Injectable()
export class OutboxPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisher.name);
  private readonly config: OutboxPublisherConfig;
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isShuttingDown = false;
  private readonly workerId = `outbox-${randomUUID()}`;

  constructor(
    private readonly outboxRepository: OutboxRepository,
    private readonly outboxService: OutboxService,
    private readonly metricsService: MetricsService,
  ) {
    this.config = parseOutboxPublisherConfig();
  }

  /** Возвращает состояние worker для readiness probe. */
  isHealthy(): boolean {
    return !this.isShuttingDown && this.timer !== null;
  }

  /**
   * Запускает периодический polling после инициализации Nest-модуля.
   */
  onModuleInit(): void {
    this.logger.log(
      `OutboxPublisher started: intervalMs=${this.config.pollIntervalMs}, batchSize=${this.config.batchSize}, maxAttempts=${this.config.maxAttempts}, retryBaseDelayMs=${this.config.retryBaseDelayMs}, retryMaxDelayMs=${this.config.retryMaxDelayMs}, retryJitterMs=${this.config.retryJitterMs}`,
    );

    this.timer = setInterval(() => {
      void this.processDueBatch();
    }, this.config.pollIntervalMs);

    void this.processDueBatch();
  }

  /**
   * Останавливает polling при остановке приложения.
   */
  async onModuleDestroy(): Promise<void> {
    this.isShuttingDown = true;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    await this.waitUntilIdle();
    this.logger.log('OutboxPublisher stopped gracefully');
  }

  /**
   * Выполняет один проход обработки due-событий.
   */
  async processDueBatch(): Promise<OutboxPublishResult> {
    if (this.isShuttingDown) {
      this.logger.debug('OutboxPublisher tick skipped: shutting down');
      return {
        claimed: 0,
        processed: 0,
        failed: 0,
      };
    }

    if (this.isRunning) {
      this.logger.debug(
        'OutboxPublisher tick skipped: previous tick is running',
      );
      return {
        claimed: 0,
        processed: 0,
        failed: 0,
      };
    }

    this.isRunning = true;

    try {
      const events = await this.outboxRepository.claimDueEvents(
        this.config.batchSize,
        this.workerId,
        this.config.leaseDurationMs,
      );
      const result: OutboxPublishResult = {
        claimed: events.length,
        processed: 0,
        failed: 0,
      };

      for (const event of events) {
        const processed = await this.processEvent(event);

        if (processed) {
          result.processed += 1;
        } else {
          result.failed += 1;
        }
      }

      if (result.claimed > 0) {
        this.logger.log(
          `OutboxPublisher tick completed: claimed=${result.claimed}, processed=${result.processed}, failed=${result.failed}`,
        );
      }

      await this.refreshOutboxStatusMetrics();

      return result;
    } catch (error) {
      this.logger.error(
        `OutboxPublisher tick failed: error=${this.toErrorMessage(error)}`,
      );

      return {
        claimed: 0,
        processed: 0,
        failed: 0,
      };
    } finally {
      this.isRunning = false;
    }
  }

  private async processEvent(event: OutboxEventRecord): Promise<boolean> {
    return runWithObservabilityContext(
      {
        correlationId: this.createOutboxCorrelationId(event),
      },
      () => this.processEventWithContext(event),
    );
  }

  private async processEventWithContext(
    event: OutboxEventRecord,
  ): Promise<boolean> {
    const startedAt = process.hrtime.bigint();
    const correlationId = this.createOutboxCorrelationId(event);

    try {
      this.logger.log(
        JSON.stringify({
          event: 'outbox.event_processing_started',
          correlationId,
          outboxEventId: event.id,
          eventType: event.eventType,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          attempts: event.attempts,
        }),
      );
      await this.outboxService.handleEvent(event);
      await this.outboxRepository.markProcessed(event.id, event.leaseToken);
      this.metricsService.observeOutboxProcessed(
        event.eventType,
        this.getDurationSeconds(startedAt),
      );
      this.logger.log(
        JSON.stringify({
          event: 'outbox.event_processed',
          correlationId,
          outboxEventId: event.id,
          eventType: event.eventType,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          durationSeconds: this.getDurationSeconds(startedAt),
        }),
      );
      return true;
    } catch (error) {
      const attempts = event.attempts + 1;
      const message = this.toErrorMessage(error);
      const details = this.getErrorDetails(error);
      const shouldDeadLetter = attempts >= this.config.maxAttempts;
      const nextRetryAt = shouldDeadLetter
        ? null
        : new Date(Date.now() + this.getRetryDelayMs(attempts));

      if (shouldDeadLetter) {
        await this.outboxRepository.markDeadLetter(
          event.id,
          attempts,
          message,
          details.code,
          details.stack,
          message,
          event.leaseToken,
        );
        this.metricsService.observeOutboxDeadLetter?.(event.eventType);
      } else {
        await this.outboxRepository.markFailed(
          event.id,
          attempts,
          message,
          nextRetryAt,
          details.code,
          details.stack,
          event.leaseToken,
        );
      }
      this.metricsService.observeOutboxFailed(
        event.eventType,
        this.getDurationSeconds(startedAt),
      );

      this.logger.error(
        JSON.stringify({
          event: 'outbox.event_failed',
          correlationId,
          outboxEventId: event.id,
          eventType: event.eventType,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          attempts,
          status: shouldDeadLetter ? 'dead_letter' : 'failed',
          nextRetryAt: nextRetryAt?.toISOString() ?? null,
          error: message,
          durationSeconds: this.getDurationSeconds(startedAt),
        }),
      );

      return false;
    }
  }

  private getRetryDelayMs(attempts: number): number {
    const exponentialDelay =
      this.config.retryBaseDelayMs * 2 ** Math.max(attempts - 1, 0);
    const cappedDelay = Math.min(exponentialDelay, this.config.retryMaxDelayMs);
    const jitter =
      this.config.retryJitterMs > 0
        ? Math.floor(Math.random() * (this.config.retryJitterMs + 1))
        : 0;

    return Math.min(cappedDelay + jitter, this.config.retryMaxDelayMs);
  }

  private getDurationSeconds(startedAt: bigint): number {
    return Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
  }

  private async refreshOutboxStatusMetrics(): Promise<void> {
    const statusCounts = await this.outboxRepository.countByStatus();

    for (const item of statusCounts) {
      this.metricsService.setOutboxStatusCount(item.status, item.count);
    }
    if (this.outboxRepository.oldestPendingAgeSeconds) {
      this.metricsService.setOutboxOldestEventAge(
        await this.outboxRepository.oldestPendingAgeSeconds(),
      );
    }
  }

  private toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message.slice(0, 4000);
    }

    return String(error).slice(0, 4000);
  }

  private getErrorDetails(error: unknown): {
    code: string | null;
    stack: string | null;
  } {
    const candidate = error as { code?: unknown; stack?: unknown };
    return {
      code: typeof candidate?.code === 'string' ? candidate.code : null,
      stack: typeof candidate?.stack === 'string' ? candidate.stack : null,
    };
  }

  private createOutboxCorrelationId(event: OutboxEventRecord): string {
    return `outbox:${event.eventType}:${event.aggregateType}:${event.aggregateId}:event:${event.id}`;
  }

  /**
   * Ждет завершения текущего tick при graceful shutdown.
   */
  private async waitUntilIdle(): Promise<void> {
    const startedAt = Date.now();

    while (this.isRunning) {
      if (Date.now() - startedAt >= this.config.shutdownTimeoutMs) {
        this.logger.warn(
          `OutboxPublisher shutdown timeout reached: timeoutMs=${this.config.shutdownTimeoutMs}`,
        );
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}
