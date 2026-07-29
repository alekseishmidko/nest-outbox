import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { createCliPool } from '../connections/create-cli-pool';

type MigrationRow = RowDataPacket & {
  version: string;
};

const migrationsDir = join(process.cwd(), 'database', 'migrations');

/**
 * Применяет новые SQL-миграции из `database/migrations`.
 */
export async function runMigrations(): Promise<void> {
  const pool = createCliPool({ multipleStatements: true });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (version)
      ) ENGINE = InnoDB
        DEFAULT CHARSET = utf8mb4
        COLLATE = utf8mb4_unicode_ci
    `);

    const [appliedRows] = await pool.query<MigrationRow[]>(
      'SELECT version FROM schema_migrations',
    );
    const appliedVersions = new Set(appliedRows.map((row) => row.version));
    const migrationFiles = (await readdir(migrationsDir))
      .filter((fileName) => fileName.endsWith('.sql'))
      .sort((left, right) => left.localeCompare(right));

    for (const fileName of migrationFiles) {
      if (appliedVersions.has(fileName)) {
        console.log(`[migrate] skip ${fileName}`);
        continue;
      }

      const sql = await readFile(join(migrationsDir, fileName), 'utf8');

      console.log(`[migrate] apply ${fileName}`);
      await pool.query(sql);
      await pool.execute<ResultSetHeader>(
        'INSERT INTO schema_migrations (version) VALUES (?)',
        [fileName],
      );
      console.log(`[migrate] applied ${fileName}`);
    }

    console.log('[migrate] done');
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runMigrations().catch((error) => {
    console.error('[migrate] failed');
    console.error(error);
    process.exit(1);
  });
}
