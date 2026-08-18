import { Injectable, Logger } from '@nestjs/common';
import { MetricsService } from '../../metrics/services/metrics.service';
import { InboxRepository } from '../repositories/inbox.repository';
import { ReceiveInboxEventDto } from '../dto/receive-inbox-event.dto';
import { InboxEventRecord } from '../types/inbox-event-record.type';

/** Функция обработки одного типа входящего события. */
export type InboxEventHandler = (event: InboxEventRecord) => Promise<void>;

/** Принимает входящие события и предоставляет идемпотентную обработку. */
@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);
  private readonly handlers = new Map<string, InboxEventHandler>();

  constructor(
    private readonly repository: InboxRepository,
    private readonly metricsService: MetricsService,
  ) {}

  /** Сохраняет событие; повторный eventId не создает вторую запись. */
  receive(
    dto: ReceiveInboxEventDto,
  ): Promise<{ record: InboxEventRecord; created: boolean }> {
    return this.repository.receive(dto);
  }

  /** Регистрирует обработчик конкретного типа события. */
  registerHandler(eventType: string, handler: InboxEventHandler): void {
    this.handlers.set(eventType, handler);
  }

  /** Обрабатывает одну пачку с retry и dead-letter. */
  async processDueBatch(config: {
    batchSize: number;
    maxAttempts: number;
    retryBaseDelayMs: number;
    retryMaxDelayMs: number;
  }): Promise<{ claimed: number; processed: number; failed: number }> {
    const events = await this.repository.claimDueEvents(config.batchSize);
    let processed = 0;
    let failed = 0;
    for (const event of events) {
      try {
        const handler = this.handlers.get(event.eventType);
        if (!handler)
          throw new Error(`No Inbox handler for ${event.eventType}`);
        await handler(event);
        await this.repository.markProcessed(event.id);
        this.metricsService.observeInboxProcessed(
          event.eventType,
          this.lagSeconds(event),
        );
        processed += 1;
      } catch (error) {
        const message = this.errorMessage(error);
        if (event.attempts >= config.maxAttempts) {
          await this.repository.markDeadLetter(event.id, message);
        } else {
          const delay = Math.min(
            config.retryBaseDelayMs * 2 ** Math.max(event.attempts - 1, 0),
            config.retryMaxDelayMs,
          );
          await this.repository.markFailed(
            event.id,
            message,
            new Date(Date.now() + delay),
          );
        }
        this.metricsService.observeInboxFailed(
          event.eventType,
          this.lagSeconds(event),
        );
        this.logger.error(
          JSON.stringify({
            event: 'inbox.event_failed',
            inboxEventId: event.id,
            eventId: event.eventId,
            eventType: event.eventType,
            attempts: event.attempts,
            error: message,
          }),
        );
        failed += 1;
      }
    }
    return { claimed: events.length, processed, failed };
  }

  private lagSeconds(event: InboxEventRecord): number {
    return Math.max(0, (Date.now() - event.createdAt.getTime()) / 1000);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
