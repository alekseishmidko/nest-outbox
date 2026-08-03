import { Injectable } from '@nestjs/common';
import { RowDataPacket } from 'mysql2';
import { DatabaseService } from '../../database/database.service';
import { HealthCheckResult } from '../types/health-check-result.type';

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
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Проверяет готовность приложения и доступность MySQL.
   */
  async checkReadiness(): Promise<HealthCheckResult> {
    const [rows] = await this.databaseService
      .getPool()
      .query<HealthRow[]>('SELECT 1 AS health_check');
    const healthCheck = rows[0]?.health_check;

    if (healthCheck !== 1) {
      throw new Error('MySQL health check returned unexpected result');
    }

    return {
      status: 'ok',
      database: 'ok',
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
