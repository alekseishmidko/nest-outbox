import { createPool, Pool } from 'mysql2/promise';
import { parseDatabaseEnv } from '../config/database-env.schema';

/**
 * Создает MySQL pool для CLI-команд.
 *
 * Используется migration runner и seed-командами вне NestJS DI-контейнера.
 */
export function createCliPool(options?: {
  multipleStatements?: boolean;
}): Pool {
  const config = parseDatabaseEnv();

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
    multipleStatements: options?.multipleStatements ?? false,
  });
}
