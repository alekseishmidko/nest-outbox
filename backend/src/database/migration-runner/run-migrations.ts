import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { Pool, PoolConnection } from 'mysql2/promise';
import { createCliPool } from '../connections/create-cli-pool';

type MigrationRow = RowDataPacket & {
  version: string;
  checksum: string | null;
};

type AdvisoryLockRow = RowDataPacket & {
  lock_status: 0 | 1 | null;
};

type SchemaColumnRow = RowDataPacket & {
  COLUMN_NAME: string;
};

type MigrationFile = {
  version: string;
  sql: string;
  checksum: string;
};

type RunMigrationsOptions = {
  dryRun?: boolean;
  lockName?: string;
  lockTimeoutSeconds?: number;
  migrationsDir?: string;
  pool?: Pool;
};

const defaultMigrationsDir = join(process.cwd(), 'database', 'migrations');
const defaultLockName = 'nest_outbox:schema_migrations';

/**
 * Применяет новые SQL-миграции из `database/migrations`.
 */
export async function runMigrations(
  options: RunMigrationsOptions = {},
): Promise<void> {
  const dryRun = options.dryRun ?? isDryRunArgEnabled();
  const pool = options.pool ?? createCliPool({ multipleStatements: true });
  const ownsPool = !options.pool;
  const connection = await pool.getConnection();

  try {
    await acquireAdvisoryLock(
      connection,
      options.lockName ?? defaultLockName,
      options.lockTimeoutSeconds ?? 30,
    );

    try {
      const migrationFiles = await readMigrationFiles(
        options.migrationsDir ?? defaultMigrationsDir,
      );

      if (!dryRun) {
        await ensureSchemaMigrationsTable(connection);
        await backfillLegacyChecksums(connection, migrationFiles);
      }

      const appliedRows = await readAppliedMigrations(connection, dryRun);
      const appliedByVersion = new Map(
        appliedRows.map((row) => [row.version, row]),
      );

      validateAppliedChecksums(migrationFiles, appliedByVersion);

      for (const migration of migrationFiles) {
        if (appliedByVersion.has(migration.version)) {
          console.log(`[migrate] skip ${migration.version}`);
          continue;
        }

        if (dryRun) {
          console.log(
            `[migrate] dry-run apply ${migration.version} checksum=${migration.checksum}`,
          );
          continue;
        }

        const startedAt = Date.now();

        console.log(`[migrate] apply ${migration.version}`);
        await connection.query(migration.sql);
        await connection.execute<ResultSetHeader>(
          `
            INSERT INTO schema_migrations (
              version,
              checksum,
              execution_time_ms
            ) VALUES (?, ?, ?)
          `,
          [migration.version, migration.checksum, Date.now() - startedAt],
        );
        console.log(
          `[migrate] applied ${migration.version} checksum=${migration.checksum}`,
        );
      }

      console.log(dryRun ? '[migrate] dry-run done' : '[migrate] done');
    } finally {
      await releaseAdvisoryLock(
        connection,
        options.lockName ?? defaultLockName,
      );
    }
  } finally {
    connection.release();

    if (ownsPool) {
      await pool.end();
    }
  }
}

/**
 * Создает и обновляет служебную таблицу миграций.
 */
async function ensureSchemaMigrationsTable(
  connection: PoolConnection,
): Promise<void> {
  await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) NOT NULL,
        checksum CHAR(64) NULL,
        execution_time_ms INT UNSIGNED NULL,
        applied_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (version)
      ) ENGINE = InnoDB
        DEFAULT CHARSET = utf8mb4
        COLLATE = utf8mb4_unicode_ci
    `);

  const columns = await readSchemaMigrationColumns(connection);

  if (!columns.has('checksum')) {
    await connection.query(
      'ALTER TABLE schema_migrations ADD COLUMN checksum CHAR(64) NULL AFTER version',
    );
  }

  if (!columns.has('execution_time_ms')) {
    await connection.query(
      'ALTER TABLE schema_migrations ADD COLUMN execution_time_ms INT UNSIGNED NULL AFTER checksum',
    );
  }
}

/**
 * Возвращает список колонок `schema_migrations`.
 */
async function readSchemaMigrationColumns(
  connection: PoolConnection,
): Promise<Set<string>> {
  const [rows] = await connection.query<SchemaColumnRow[]>(
    `
      SELECT COLUMN_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'schema_migrations'
    `,
  );

  return new Set(rows.map((row) => row.COLUMN_NAME));
}

/**
 * Считывает примененные миграции. В dry-run режиме не меняет БД.
 */
async function readAppliedMigrations(
  connection: PoolConnection,
  dryRun: boolean,
): Promise<MigrationRow[]> {
  const hasTable = await schemaMigrationsTableExists(connection);

  if (!hasTable) {
    return [];
  }

  const columns = await readSchemaMigrationColumns(connection);
  const checksumSelect = columns.has('checksum')
    ? 'checksum'
    : 'NULL AS checksum';
  const [rows] = await connection.query<MigrationRow[]>(
    `
      SELECT
        version,
        ${checksumSelect}
      FROM schema_migrations
      ORDER BY version ASC
    `,
  );

  if (dryRun && !columns.has('checksum') && rows.length > 0) {
    console.warn(
      '[migrate] dry-run warning: schema_migrations has no checksum column, existing migrations cannot be verified',
    );
  }

  return rows;
}

/**
 * Проверяет наличие таблицы `schema_migrations`.
 */
async function schemaMigrationsTableExists(
  connection: PoolConnection,
): Promise<boolean> {
  const [rows] = await connection.query<RowDataPacket[]>(
    `
      SELECT 1
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'schema_migrations'
      LIMIT 1
    `,
  );

  return rows.length > 0;
}

/**
 * Заполняет checksum для миграций, примененных старой версией runner.
 */
async function backfillLegacyChecksums(
  connection: PoolConnection,
  migrationFiles: MigrationFile[],
): Promise<void> {
  const [legacyRows] = await connection.query<MigrationRow[]>(
    `
      SELECT
        version,
        checksum
      FROM schema_migrations
      WHERE checksum IS NULL
      ORDER BY version ASC
    `,
  );
  const byVersion = new Map(
    migrationFiles.map((migration) => [migration.version, migration]),
  );

  for (const row of legacyRows) {
    const migration = byVersion.get(row.version);

    if (!migration) {
      throw new Error(
        `Applied migration ${row.version} has no SQL file for checksum backfill`,
      );
    }

    await connection.execute(
      `
        UPDATE schema_migrations
        SET
          checksum = ?,
          execution_time_ms = COALESCE(execution_time_ms, 0)
        WHERE version = ?
          AND checksum IS NULL
      `,
      [migration.checksum, migration.version],
    );
    console.log(
      `[migrate] backfilled checksum for ${migration.version}: ${migration.checksum}`,
    );
  }
}

/**
 * Читает SQL-файлы миграций и считает SHA-256 checksum.
 */
async function readMigrationFiles(
  migrationsDir: string,
): Promise<MigrationFile[]> {
  const fileNames = (await readdir(migrationsDir))
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));
  const migrations: MigrationFile[] = [];

  for (const fileName of fileNames) {
    const sql = await readFile(join(migrationsDir, fileName), 'utf8');

    migrations.push({
      version: fileName,
      sql,
      checksum: createChecksum(sql),
    });
  }

  return migrations;
}

/**
 * Проверяет, что примененные миграции не изменились на диске.
 */
function validateAppliedChecksums(
  migrationFiles: MigrationFile[],
  appliedByVersion: Map<string, MigrationRow>,
): void {
  const byVersion = new Map(
    migrationFiles.map((migration) => [migration.version, migration]),
  );

  for (const applied of appliedByVersion.values()) {
    const migration = byVersion.get(applied.version);

    if (!migration) {
      throw new Error(
        `Applied migration ${applied.version} is missing from database/migrations`,
      );
    }

    if (applied.checksum && applied.checksum !== migration.checksum) {
      throw new Error(
        `Checksum mismatch for ${applied.version}: applied=${applied.checksum}, current=${migration.checksum}`,
      );
    }
  }
}

/**
 * Берет MySQL advisory lock на время работы migration runner.
 */
async function acquireAdvisoryLock(
  connection: PoolConnection,
  lockName: string,
  timeoutSeconds: number,
): Promise<void> {
  const [rows] = await connection.query<AdvisoryLockRow[]>(
    'SELECT GET_LOCK(?, ?) AS lock_status',
    [lockName, timeoutSeconds],
  );

  if (rows[0]?.lock_status !== 1) {
    throw new Error(`Cannot acquire migration advisory lock: ${lockName}`);
  }

  console.log(`[migrate] advisory lock acquired: ${lockName}`);
}

/**
 * Освобождает MySQL advisory lock.
 */
async function releaseAdvisoryLock(
  connection: PoolConnection,
  lockName: string,
): Promise<void> {
  await connection.query('SELECT RELEASE_LOCK(?) AS release_status', [
    lockName,
  ]);
  console.log(`[migrate] advisory lock released: ${lockName}`);
}

/**
 * Считает SHA-256 checksum SQL-файла.
 */
function createChecksum(sql: string): string {
  return createHash('sha256').update(sql, 'utf8').digest('hex');
}

/**
 * Проверяет dry-run флаг CLI или env.
 */
function isDryRunArgEnabled(): boolean {
  return (
    process.argv.includes('--dry-run') ||
    process.env.MIGRATION_DRY_RUN === 'true'
  );
}

if (require.main === module) {
  runMigrations().catch((error) => {
    console.error('[migrate] failed');
    console.error(error);
    process.exit(1);
  });
}
