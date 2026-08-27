import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InboxService } from '../services/inbox.service';
import { parseInboxWorkerConfig } from '../config/inbox-worker.config';

/** Polling worker Inbox, запускающий обработку due-событий. */
@Injectable()
export class InboxWorker implements OnModuleInit, OnModuleDestroy {
  private readonly config = parseInboxWorkerConfig();
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private shuttingDown = false;

  constructor(private readonly inboxService: InboxService) {}

  /** Запускает периодический polling. */
  onModuleInit(): void {
    this.timer = setInterval(
      () => void this.processDueBatch(),
      this.config.pollIntervalMs,
    );
    void this.processDueBatch();
  }

  /** Останавливает polling перед завершением приложения. */
  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const startedAt = Date.now();
    const timeoutMs = Number(
      process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS ?? 10_000,
    );
    while (this.running && Date.now() - startedAt < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  /** Выполняет один проход Inbox worker. */
  async processDueBatch(): Promise<void> {
    if (this.shuttingDown || this.running) return;
    this.running = true;
    try {
      await this.inboxService.processDueBatch(this.config);
    } finally {
      this.running = false;
    }
  }
}
