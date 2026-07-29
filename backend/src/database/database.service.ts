import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Pool, RowDataPacket } from 'mysql2/promise';
import { MYSQL_POOL } from './connections/mysql-pool.token';
import { parseDatabaseEnv } from './config/database-env.schema';

type DatabaseHealthCheckRow = RowDataPacket & {
  health_check: number;
};

/**
 * Сервис базы данных.
 *
 * Проверяет подключение к MySQL при старте приложения, закрывает connection pool
 * при остановке и предоставляет доступ к pool для низкоуровневых операций.
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  /**
   * Проверяет, что `DatabaseModule` реально подключился к MySQL при запуске Nest.
   */
  async onModuleInit(): Promise<void> {
    const config = parseDatabaseEnv();

    this.logger.log(
      `DatabaseModule initialization started: host=${config.MYSQL_HOST}, port=${config.MYSQL_PORT}, database=${config.MYSQL_DATABASE}, user=${config.MYSQL_USER}`,
    );

    const [rows] = await this.pool.query<DatabaseHealthCheckRow[]>(
      'SELECT 1 AS health_check',
    );
    const healthCheck = rows[0]?.health_check;

    if (healthCheck !== 1) {
      throw new Error('MySQL health check returned unexpected result');
    }

    this.logger.log('DatabaseModule connected to MySQL successfully');
  }

  /**
   * Закрывает MySQL connection pool при остановке приложения.
   */
  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
    this.logger.log('MySQL connection pool closed');
  }

  /**
   * Возвращает MySQL connection pool для repositories и infrastructure-кода.
   */
  getPool(): Pool {
    return this.pool;
  }
}
