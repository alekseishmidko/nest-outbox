import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMigrations } from './run-migrations';

type FakeConnectionOptions = {
  appliedRows?: Array<{ version: string; checksum: string | null }>;
  checksumNullRows?: Array<{ version: string; checksum: string | null }>;
  columns?: string[];
  tableExists?: boolean;
  lockStatus?: 0 | 1 | null;
};

describe('runMigrations', () => {
  let migrationsDir: string;

  beforeEach(async () => {
    migrationsDir = await mkdtemp(join(tmpdir(), 'nest-outbox-migrations-'));
  });

  afterEach(async () => {
    await rm(migrationsDir, { recursive: true, force: true });
  });

  it('в dry-run режиме выводит план и не применяет SQL миграции', async () => {
    await writeFile(join(migrationsDir, '001_test.sql'), 'SELECT 1;', 'utf8');
    const { pool, connection } = createFakePool({
      appliedRows: [],
    });

    await runMigrations({
      dryRun: true,
      migrationsDir,
      pool: pool as never,
    });

    expect(connection.query).not.toHaveBeenCalledWith('SELECT 1;');
    expect(connection.execute).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalled();
    expect(pool.end).not.toHaveBeenCalled();
  });

  it('запрещает запуск, если checksum примененной миграции отличается от файла', async () => {
    await writeFile(join(migrationsDir, '001_test.sql'), 'SELECT 1;', 'utf8');
    const { pool, connection } = createFakePool({
      appliedRows: [{ version: '001_test.sql', checksum: 'changed' }],
    });

    await expect(
      runMigrations({
        dryRun: true,
        migrationsDir,
        pool: pool as never,
      }),
    ).rejects.toThrow('Checksum mismatch for 001_test.sql');
    expect(connection.query).toHaveBeenCalledWith(
      'SELECT RELEASE_LOCK(?) AS release_status',
      ['nest_outbox:schema_migrations'],
    );
  });

  it('применяет новую миграцию и сохраняет checksum с временем выполнения', async () => {
    await writeFile(join(migrationsDir, '001_test.sql'), 'SELECT 1;', 'utf8');
    const { pool, connection } = createFakePool({
      appliedRows: [],
      checksumNullRows: [],
    });

    await runMigrations({
      migrationsDir,
      pool: pool as never,
    });

    expect(connection.query).toHaveBeenCalledWith('SELECT 1;');
    expect(connection.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO schema_migrations'),
      [
        '001_test.sql',
        expect.stringMatching(/^[a-f0-9]{64}$/),
        expect.any(Number),
      ],
    );
    expect(connection.release).toHaveBeenCalled();
  });

  it('падает, если advisory lock занят другим процессом', async () => {
    await writeFile(join(migrationsDir, '001_test.sql'), 'SELECT 1;', 'utf8');
    const { pool } = createFakePool({
      lockStatus: 0,
    });

    await expect(
      runMigrations({
        migrationsDir,
        pool: pool as never,
      }),
    ).rejects.toThrow('Cannot acquire migration advisory lock');
  });
});

function createFakePool(options: FakeConnectionOptions = {}) {
  const connection = {
    query: jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('GET_LOCK')) {
        return [[{ lock_status: options.lockStatus ?? 1 }]];
      }

      if (sql.includes('RELEASE_LOCK')) {
        return [[{ release_status: 1 }]];
      }

      if (sql.includes('information_schema.TABLES')) {
        return [options.tableExists === false ? [] : [{ exists: 1 }]];
      }

      if (sql.includes('information_schema.COLUMNS')) {
        return [
          (options.columns ?? ['checksum', 'execution_time_ms']).map(
            (columnName) => ({
              COLUMN_NAME: columnName,
            }),
          ),
        ];
      }

      if (sql.includes('WHERE checksum IS NULL')) {
        return [options.checksumNullRows ?? []];
      }

      if (sql.includes('SELECT') && sql.includes('FROM schema_migrations')) {
        return [options.appliedRows ?? []];
      }

      return [[]];
    }),
    execute: jest.fn().mockResolvedValue([{ affectedRows: 1 }]),
    release: jest.fn(),
  };
  const pool = {
    getConnection: jest.fn().mockResolvedValue(connection),
    end: jest.fn(),
  };

  return { pool, connection };
}
