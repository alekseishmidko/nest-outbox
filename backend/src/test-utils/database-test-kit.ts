import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createPool, Pool } from 'mysql2/promise';

type DatabaseTestKit = {
  databaseName: string;
  pool: Pool;
  resetTables: () => Promise<void>;
  destroy: () => Promise<void>;
};

const TABLES = [
  'inbox_events',
  'processed_events',
  'idempotency_keys',
  'media_assets',
  'outbox_events',
  'refresh_tokens',
  'order_sagas',
  'orders',
  'maps',
  'users',
] as const;

/**
 * Проверяет, можно ли запускать integration/e2e тесты с реальной MySQL.
 */
export function isDatabaseTestEnabled(flagName: string): boolean {
  return process.env[flagName] === 'true';
}

/**
 * Создает изолированную тестовую БД, применяет SQL-миграцию и возвращает pool.
 */
export async function createDatabaseTestKit(
  suiteName: string,
): Promise<DatabaseTestKit> {
  const host = process.env.TEST_MYSQL_HOST ?? '127.0.0.1';
  const port = Number(process.env.TEST_MYSQL_PORT ?? 3306);
  const rootUser = process.env.TEST_MYSQL_ROOT_USER ?? 'root';
  const rootPassword = process.env.TEST_MYSQL_ROOT_PASSWORD ?? 'root_password';
  const databaseName =
    process.env.TEST_MYSQL_DATABASE ??
    `nest_outbox_test_${sanitizeIdentifier(suiteName)}_${process.pid}`;

  assertSafeIdentifier(databaseName);

  const rootPool = createPool({
    host,
    port,
    user: rootUser,
    password: rootPassword,
    multipleStatements: true,
  });

  await rootPool.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
  await rootPool.query(
    `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await rootPool.end();

  const pool = createPool({
    host,
    port,
    user: rootUser,
    password: rootPassword,
    database: databaseName,
    multipleStatements: true,
    waitForConnections: true,
    connectionLimit: 10,
  });
  await applyMigrations(pool);

  return {
    databaseName,
    pool,
    resetTables: async () => {
      await pool.query('SET FOREIGN_KEY_CHECKS = 0');

      for (const tableName of TABLES) {
        await pool.query(`TRUNCATE TABLE \`${tableName}\``);
      }

      await pool.query('SET FOREIGN_KEY_CHECKS = 1');
    },
    destroy: async () => {
      await pool.end();

      const cleanupPool = createPool({
        host,
        port,
        user: rootUser,
        password: rootPassword,
      });

      await cleanupPool.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
      await cleanupPool.end();
    },
  };
}

/**
 * Прокидывает параметры тестовой БД в env приложения до сборки Nest-модуля.
 */
export function applyDatabaseEnv(databaseName: string): void {
  process.env.MYSQL_HOST = process.env.TEST_MYSQL_HOST ?? '127.0.0.1';
  process.env.MYSQL_PORT = process.env.TEST_MYSQL_PORT ?? '3306';
  process.env.MYSQL_DATABASE = databaseName;
  process.env.MYSQL_USER = process.env.TEST_MYSQL_ROOT_USER ?? 'root';
  process.env.MYSQL_PASSWORD =
    process.env.TEST_MYSQL_ROOT_PASSWORD ?? 'root_password';
  process.env.OUTBOX_POLL_INTERVAL_MS = '600000';
  process.env.OUTBOX_BATCH_SIZE = '10';
  process.env.OUTBOX_MAX_ATTEMPTS = '5';
  process.env.OUTBOX_RETRY_BASE_DELAY_MS = '1';
}

function sanitizeIdentifier(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9_]/g, '_');
}

function assertSafeIdentifier(value: string): void {
  if (!/^[a-zA-Z0-9_]+$/.test(value)) {
    throw new Error(`Unsafe MySQL identifier for test database: ${value}`);
  }
}

/**
 * Применяет все SQL-миграции в тестовую БД в том же порядке, что production runner.
 */
async function applyMigrations(pool: Pool): Promise<void> {
  const migrationsDir = join(process.cwd(), 'database', 'migrations');
  const migrationFiles = (await readdir(migrationsDir))
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));

  for (const fileName of migrationFiles) {
    const sql = await readFile(join(migrationsDir, fileName), 'utf8');

    await pool.query(sql);
  }
}
