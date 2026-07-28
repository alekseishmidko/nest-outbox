import { Logger, Provider } from '@nestjs/common';
import { createPool, Pool } from 'mysql2/promise';
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

      return createPool({
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
    },
  };
}
