import { Logger, Provider } from '@nestjs/common';
import { createPool, Pool, PoolConnection } from 'mysql2/promise';
import { getObservabilityContext } from '../../common/observability/observability-context';
import { dbQueryDurationSeconds } from '../../metrics/collectors/prometheus-metrics';
import { parseDatabaseEnv } from '../config/database-env.schema';
import { parseSqlObservabilityConfig } from '../config/sql-observability.config';
import { MYSQL_POOL } from './mysql-pool.token';

const logger = new Logger('MySQLPoolProvider');
const instrumentedConnections = new WeakSet<PoolConnection>();

type QueryMethod = Pool['query'] | PoolConnection['query'];
type ExecuteMethod = Pool['execute'] | PoolConnection['execute'];

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
  const originalGetConnection = pool.getConnection.bind(pool);

  pool.execute = instrumentExecute(pool.execute.bind(pool), 'pool.execute');
  pool.query = instrumentQuery(pool.query.bind(pool), 'pool.query');
  pool.getConnection = async () =>
    instrumentConnection(await originalGetConnection());

  return pool;
}

function instrumentConnection(connection: PoolConnection): PoolConnection {
  if (instrumentedConnections.has(connection)) {
    return connection;
  }

  connection.execute = instrumentExecute(
    connection.execute.bind(connection),
    'connection.execute',
  );
  connection.query = instrumentQuery(
    connection.query.bind(connection),
    'connection.query',
  );

  instrumentedConnections.add(connection);

  return connection;
}

function instrumentExecute<T extends ExecuteMethod>(
  originalExecute: T,
  command: string,
): T {
  return instrumentSqlMethod(originalExecute, command) as T;
}

function instrumentQuery<T extends QueryMethod>(
  originalQuery: T,
  command: string,
): T {
  return instrumentSqlMethod(originalQuery, command) as T;
}

function instrumentSqlMethod<T extends (...args: never[]) => Promise<unknown>>(
  originalMethod: T,
  command: string,
): T {
  return (async (...args: Parameters<T>) => {
    const operation = inferDbOperation(command);
    const sql = extractSql(args[0]);
    const startedAt = process.hrtime.bigint();
    const end = dbQueryDurationSeconds.startTimer({ operation, command });

    try {
      return await originalMethod(...args);
    } catch (error) {
      logSqlError({
        command,
        operation,
        sql,
        durationMs: getDurationMs(startedAt),
        error,
      });
      throw error;
    } finally {
      const durationMs = getDurationMs(startedAt);

      end();
      logSlowQuery({
        command,
        operation,
        sql,
        durationMs,
      });
    }
  }) as T;
}

function logSlowQuery(input: {
  command: string;
  operation: string;
  sql: string;
  durationMs: number;
}): void {
  const config = parseSqlObservabilityConfig();

  if (input.durationMs < config.slowQueryThresholdMs) {
    return;
  }

  logger.warn(
    JSON.stringify({
      event: 'db.slow_query',
      command: input.command,
      operation: input.operation,
      durationMs: Math.round(input.durationMs * 100) / 100,
      slowQueryThresholdMs: config.slowQueryThresholdMs,
      sql: normalizeSql(input.sql),
      ...getObservabilityContext(),
    }),
  );
}

function logSqlError(input: {
  command: string;
  operation: string;
  sql: string;
  durationMs: number;
  error: unknown;
}): void {
  logger.error(
    JSON.stringify({
      event: 'db.query_error',
      command: input.command,
      operation: input.operation,
      durationMs: Math.round(input.durationMs * 100) / 100,
      sql: normalizeSql(input.sql),
      error:
        input.error instanceof Error
          ? input.error.message
          : String(input.error),
      ...getObservabilityContext(),
    }),
  );
}

function inferDbOperation(command: string): string {
  const stack = new Error().stack?.split('\n') ?? [];
  const repositoryFrame = stack.find((line) => line.includes('/repositories/'));

  if (!repositoryFrame) {
    return command;
  }

  const methodMatch = repositoryFrame.match(/at\s+(.+?)\s+\(/);
  const methodName = methodMatch?.[1]?.replace(/^async\s+/, '');

  if (methodName) {
    return methodName;
  }

  const pathMatch = repositoryFrame.match(
    /src\/(.+?)\/repositories\/(.+?)\.ts/,
  );

  if (!pathMatch) {
    return command;
  }

  return `${pathMatch[1]}.${pathMatch[2]}`;
}

function extractSql(input: unknown): string {
  if (typeof input === 'string') {
    return input;
  }

  if (input && typeof input === 'object' && 'sql' in input) {
    const sql = (input as { sql?: unknown }).sql;
    return typeof sql === 'string' ? sql : 'unknown';
  }

  return 'unknown';
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().slice(0, 1000);
}

function getDurationMs(startedAt: bigint): number {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
}
