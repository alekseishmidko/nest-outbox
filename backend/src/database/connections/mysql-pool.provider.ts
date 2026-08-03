import { Logger, Provider } from '@nestjs/common';
import { createPool, Pool } from 'mysql2/promise';
import { dbQueryDurationSeconds } from '../../metrics/collectors/prometheus-metrics';
import { parseDatabaseEnv } from '../config/database-env.schema';
import { MYSQL_POOL } from './mysql-pool.token';

const logger = new Logger('MySQLPoolProvider');

/**
 * Создает NestJS provider для MySQL connection pool.
 *
 * Pool создается один раз на уровне `DatabaseModule` и дальше переиспользуется
 * repositories, migration runner и transaction helpers.
 */
export function createMysqlPoolProvider(): Provider<Pool> {
  return {
    provide: MYSQL_POOL,
    useFactory: () => {
      const config = parseDatabaseEnv();

      logger.log(
        `Creating MySQL pool: host=${config.MYSQL_HOST}, port=${config.MYSQL_PORT}, database=${config.MYSQL_DATABASE}, user=${config.MYSQL_USER}, connectionLimit=${config.MYSQL_CONNECTION_LIMIT}`,
      );

      const pool = createPool({
        host: config.MYSQL_HOST,
        port: config.MYSQL_PORT,
        database: config.MYSQL_DATABASE,
        user: config.MYSQL_USER,
        password: config.MYSQL_PASSWORD,
        waitForConnections: true,
        connectionLimit: config.MYSQL_CONNECTION_LIMIT,
        namedPlaceholders: false,
        charset: 'utf8mb4',
      });

      return instrumentPool(pool);
    },
  };
}

function instrumentPool(pool: Pool): Pool {
  const originalExecute = pool.execute.bind(pool) as (
    ...args: Parameters<Pool['execute']>
  ) => ReturnType<Pool['execute']>;
  const originalQuery = pool.query.bind(pool) as (
    ...args: Parameters<Pool['query']>
  ) => ReturnType<Pool['query']>;

  const executeWithMetrics = (async (...args: Parameters<Pool['execute']>) => {
    const end = dbQueryDurationSeconds.startTimer({ operation: 'execute' });

    try {
      return await originalExecute(...args);
    } finally {
      end();
    }
  }) as Pool['execute'];

  const queryWithMetrics = (async (...args: Parameters<Pool['query']>) => {
    const end = dbQueryDurationSeconds.startTimer({ operation: 'query' });

    try {
      return await originalQuery(...args);
    } finally {
      end();
    }
  }) as Pool['query'];

  pool.execute = executeWithMetrics;
  pool.query = queryWithMetrics;

  return pool;
}
