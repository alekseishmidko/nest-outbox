import { Inject, Injectable } from '@nestjs/common';
import { ResultSetHeader } from 'mysql2';
import { Pool, PoolConnection } from 'mysql2/promise';
import { MysqlError } from '../../common/types/mysql-error.type';
import { MYSQL_POOL } from '../../database/connections/mysql-pool.token';
import { DeadlockStepResult } from '../types/deadlock-step-result.type';
import { IsolationLevel } from '../types/isolation-level.type';
import { IsolationScenarioResult } from '../types/isolation-scenario-result.type';
import { LabItemRow } from '../types/lab-item-row.type';

type DeadlockMysqlError = MysqlError & {
  sqlState?: string;
};

/**
 * Repository учебных транзакционных сценариев.
 *
 * Цель: открыть отдельные MySQL-соединения для параллельных сессий и держать
 * SQL демонстраций вне controller/service-слоя.
 * Возможные ошибки: получение соединения, SQL, commit и rollback могут
 * завершиться ошибкой MySQL; соединения освобождаются в `finally`.
 */
@Injectable()
export class TransactionsLabRepository {
  private readonly isolationLevels: IsolationLevel[] = [
    'READ COMMITTED',
    'REPEATABLE READ',
  ];

  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  /**
   * Воспроизводит non-repeatable read на поддерживаемых уровнях изоляции.
   *
   * @returns Результат первого и второго чтения для каждого уровня изоляции.
   * @throws Ошибку MySQL при невозможности выполнить любой этап сценария.
   */
  async compareNonRepeatableRead(): Promise<IsolationScenarioResult[]> {
    const results: IsolationScenarioResult[] = [];

    for (const isolationLevel of this.isolationLevels) {
      results.push(await this.runNonRepeatableRead(isolationLevel));
    }

    return results;
  }

  /**
   * Воспроизводит phantom read на поддерживаемых уровнях изоляции.
   *
   * @returns Количество строк до и после вставки для каждого уровня изоляции.
   * @throws Ошибку MySQL при невозможности выполнить любой этап сценария.
   */
  async comparePhantomRead(): Promise<IsolationScenarioResult[]> {
    const results: IsolationScenarioResult[] = [];

    for (const isolationLevel of this.isolationLevels) {
      results.push(await this.runPhantomRead(isolationLevel));
    }

    return results;
  }

  /**
   * Создает deadlock: две транзакции блокируют строки в противоположном порядке.
   *
   * @returns Итог каждой ветки: commit либо rollback с данными MySQL-ошибки.
   * @throws Ошибку MySQL при подготовке таблицы или запуске транзакций.
   */
  async simulateDeadlock(): Promise<DeadlockStepResult[]> {
    const connectionA = await this.pool.getConnection();
    const connectionB = await this.pool.getConnection();

    try {
      await this.prepareTable([10, 20]);
      await connectionA.query(
        'SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ',
      );
      await connectionB.query(
        'SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ',
      );
      await connectionA.beginTransaction();
      await connectionB.beginTransaction();

      await connectionA.query(
        'UPDATE transaction_lab_items SET amount = amount + 1 WHERE id = 1',
      );
      await connectionB.query(
        'UPDATE transaction_lab_items SET amount = amount + 1 WHERE id = 2',
      );

      const results = await Promise.all([
        this.tryCommitDeadlockBranch(
          'transaction_a',
          connectionA,
          'UPDATE transaction_lab_items SET amount = amount + 1 WHERE id = 2',
        ),
        this.tryCommitDeadlockBranch(
          'transaction_b',
          connectionB,
          'UPDATE transaction_lab_items SET amount = amount + 1 WHERE id = 1',
        ),
      ]);

      return results;
    } finally {
      connectionA.release();
      connectionB.release();
    }
  }

  /**
   * Запускает сценарий non-repeatable read на одном уровне изоляции.
   */
  private async runNonRepeatableRead(
    isolationLevel: IsolationLevel,
  ): Promise<IsolationScenarioResult> {
    const reader = await this.pool.getConnection();
    const writer = await this.pool.getConnection();

    try {
      await this.prepareTable([100]);
      await this.setIsolationLevel(reader, isolationLevel);
      await this.setIsolationLevel(writer, isolationLevel);
      await reader.beginTransaction();

      const firstRead = await this.selectAmountById(reader, 1);

      await writer.beginTransaction();
      await writer.query(
        'UPDATE transaction_lab_items SET amount = 200 WHERE id = 1',
      );
      await writer.commit();

      const secondRead = await this.selectAmountById(reader, 1);
      await reader.commit();

      return {
        isolationLevel,
        firstRead,
        secondRead,
        anomalyDetected: firstRead !== secondRead,
      };
    } catch (error) {
      await this.rollbackQuietly(reader);
      await this.rollbackQuietly(writer);
      throw error;
    } finally {
      reader.release();
      writer.release();
    }
  }

  /**
   * Запускает сценарий phantom read на одном уровне изоляции.
   */
  private async runPhantomRead(
    isolationLevel: IsolationLevel,
  ): Promise<IsolationScenarioResult> {
    const reader = await this.pool.getConnection();
    const writer = await this.pool.getConnection();

    try {
      await this.prepareTable([100]);
      await this.setIsolationLevel(reader, isolationLevel);
      await this.setIsolationLevel(writer, isolationLevel);
      await reader.beginTransaction();

      const firstRead = await this.countItemsByAmount(reader, 100);

      await writer.beginTransaction();
      await writer.query(
        'INSERT INTO transaction_lab_items (amount) VALUES (150)',
      );
      await writer.commit();

      const secondRead = await this.countItemsByAmount(reader, 100);
      await reader.commit();

      return {
        isolationLevel,
        firstRead,
        secondRead,
        anomalyDetected: firstRead !== secondRead,
      };
    } catch (error) {
      await this.rollbackQuietly(reader);
      await this.rollbackQuietly(writer);
      throw error;
    } finally {
      reader.release();
      writer.release();
    }
  }

  /**
   * Подготавливает учебную таблицу и фиксированный набор строк.
   */
  private async prepareTable(amounts: number[]): Promise<void> {
    const connection = await this.pool.getConnection();

    try {
      await connection.query(`
        CREATE TABLE IF NOT EXISTS transaction_lab_items (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          amount INT NOT NULL,
          PRIMARY KEY (id),
          KEY idx_transaction_lab_items_amount (amount)
        ) ENGINE = InnoDB
      `);
      await connection.query('TRUNCATE TABLE transaction_lab_items');

      if (amounts.length === 0) {
        return;
      }

      const placeholders = amounts.map(() => '(?)').join(', ');
      await connection.query<ResultSetHeader>(
        `INSERT INTO transaction_lab_items (amount) VALUES ${placeholders}`,
        amounts,
      );
    } finally {
      connection.release();
    }
  }

  /**
   * Устанавливает isolation level до старта транзакции.
   */
  private async setIsolationLevel(
    connection: PoolConnection,
    isolationLevel: IsolationLevel,
  ): Promise<void> {
    await connection.query(
      `SET SESSION TRANSACTION ISOLATION LEVEL ${isolationLevel}`,
    );
  }

  /**
   * Возвращает `amount` конкретной строки.
   */
  private async selectAmountById(
    connection: PoolConnection,
    id: number,
  ): Promise<number> {
    const [rows] = await connection.query<LabItemRow[]>(
      'SELECT amount AS value FROM transaction_lab_items WHERE id = ?',
      [id],
    );

    return Number(rows[0]?.value ?? 0);
  }

  /**
   * Считает строки, которые попадают в predicate `amount >= minAmount`.
   */
  private async countItemsByAmount(
    connection: PoolConnection,
    minAmount: number,
  ): Promise<number> {
    const [rows] = await connection.query<LabItemRow[]>(
      'SELECT COUNT(*) AS value FROM transaction_lab_items WHERE amount >= ?',
      [minAmount],
    );

    return Number(rows[0]?.value ?? 0);
  }

  /**
   * Пытается выполнить второе обновление deadlock-сценария и зафиксировать итог.
   */
  private async tryCommitDeadlockBranch(
    transactionName: DeadlockStepResult['transactionName'],
    connection: PoolConnection,
    sql: string,
  ): Promise<DeadlockStepResult> {
    try {
      await connection.query(sql);
      await connection.commit();

      return {
        transactionName,
        status: 'committed',
        errorCode: null,
        errno: null,
        sqlState: null,
        message: null,
      };
    } catch (error) {
      await this.rollbackQuietly(connection);

      const mysqlError = error as Partial<DeadlockMysqlError>;

      return {
        transactionName,
        status: 'rolled_back',
        errorCode: mysqlError.code ?? null,
        errno: mysqlError.errno ?? null,
        sqlState: mysqlError.sqlState ?? null,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Безопасно откатывает транзакцию, если она еще активна.
   */
  private async rollbackQuietly(connection: PoolConnection): Promise<void> {
    try {
      await connection.rollback();
    } catch {
      // Ошибка rollback здесь не должна маскировать исходный результат lab.
    }
  }
}
