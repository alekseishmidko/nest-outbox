import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
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

  constructor(
    private readonly outboxRepository: OutboxRepository,
    private readonly outboxService: OutboxService,
  ) {
    this.config = parseOutboxPublisherConfig();
  }

  /**
   * Запускает периодический polling после инициализации Nest-модуля.
   */
  onModuleInit(): void {
    this.logger.log(
      `OutboxPublisher started: intervalMs=${this.config.pollIntervalMs}, batchSize=${this.config.batchSize}, maxAttempts=${this.config.maxAttempts}`,
    );

    this.timer = setInterval(() => {
      void this.processDueBatch();
    }, this.config.pollIntervalMs);

    void this.processDueBatch();
  }

  /**
   * Останавливает polling при остановке приложения.
   */
  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Выполняет один проход обработки due-событий.
   */
  async processDueBatch(): Promise<OutboxPublishResult> {
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

      return result;
    } finally {
      this.isRunning = false;
    }
  }

  private async processEvent(event: OutboxEventRecord): Promise<boolean> {
    try {
      await this.outboxService.handleEvent(event);
      await this.outboxRepository.markProcessed(event.id);
      return true;
    } catch (error) {
      const attempts = event.attempts + 1;
      const message = this.toErrorMessage(error);
      const nextRetryAt =
        attempts >= this.config.maxAttempts
          ? null
          : new Date(Date.now() + this.getRetryDelayMs(attempts));

      await this.outboxRepository.markFailed(
        event.id,
        attempts,
        message,
        nextRetryAt,
      );

      this.logger.error(
        `Outbox event failed: eventId=${event.id}, attempts=${attempts}, nextRetryAt=${nextRetryAt?.toISOString() ?? 'null'}, error=${message}`,
      );

      return false;
    }
  }

  private getRetryDelayMs(attempts: number): number {
    return this.config.retryBaseDelayMs * 2 ** Math.max(attempts - 1, 0);
  }

  private toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message.slice(0, 4000);
    }

    return String(error).slice(0, 4000);
  }
}
