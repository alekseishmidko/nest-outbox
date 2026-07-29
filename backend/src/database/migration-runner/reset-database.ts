import { createCliPool } from '../connections/create-cli-pool';
import { runMigrations } from './run-migrations';

const tables = [
  'outbox_events',
  'media_assets',
  'orders',
  'maps',
  'users',
  'schema_migrations',
];

/**
 * Удаляет таблицы приложения и применяет миграции заново.
 */
async function resetDatabase(): Promise<void> {
  const pool = createCliPool();

  try {
    console.log('[reset] drop application tables');
    await pool.query('SET FOREIGN_KEY_CHECKS = 0');

    for (const tableName of tables) {
      await pool.query(`DROP TABLE IF EXISTS ${tableName}`);
      console.log(`[reset] dropped ${tableName}`);
    }

    await pool.query('SET FOREIGN_KEY_CHECKS = 1');
  } finally {
    await pool.end();
  }

  await runMigrations();
  console.log('[reset] done');
}

resetDatabase().catch((error) => {
  console.error('[reset] failed');
  console.error(error);
  process.exit(1);
});
