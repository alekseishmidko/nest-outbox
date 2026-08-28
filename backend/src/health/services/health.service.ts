import { Injectable } from '@nestjs/common';
import { RowDataPacket } from 'mysql2';
import { DatabaseService } from '../../database/database.service';
import { HealthCheckResult } from '../types/health-check-result.type';
import { MediaStorageService } from '../../media/storage/media-storage.service';
import { OutboxPublisher } from '../../outbox/workers/outbox-publisher';
import { RedisService } from '../../redis/redis.service';

type HealthRow = RowDataPacket & {
  health_check: number;
};

/**
 * Сервис health-check.
 *
 * Содержит только технические проверки готовности приложения и не знает о
 * бизнес-модулях.
 */
@Injectable()
export class HealthService {
  /** Принимает проверки БД, storage, worker и optional Redis probe. */
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly mediaStorageService?: MediaStorageService,
    private readonly outboxPublisher?: OutboxPublisher,
    private readonly redis?: RedisService,
  ) {}

  /**
   * Проверяет готовность приложения и доступность MySQL.
   */
  async checkReadiness(): Promise<HealthCheckResult> {
    const [rows] = await this.databaseService
      .getPool()
      .query<HealthRow[]>('SELECT 1 AS health_check');
    const healthCheck = rows[0]?.health_check;

    if (healthCheck !== 1)
      throw new Error('MySQL health check returned unexpected result');
    await this.mediaStorageService?.checkReadiness();
    if (this.outboxPublisher && !this.outboxPublisher.isHealthy())
      throw new Error('Outbox worker is not ready');
    if (this.redis?.isEnabled()) await this.redis.ping();

    return {
      status: 'ok',
      database: 'ok',
      storage: 'ok',
      worker: 'ok',
      redis: this.redis?.isEnabled() ? 'ok' : 'disabled',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Проверяет, что HTTP-процесс приложения жив.
   */
  checkLiveness(): Omit<HealthCheckResult, 'database'> {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
