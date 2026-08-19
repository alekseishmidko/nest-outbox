import { Inject, Injectable } from '@nestjs/common';
import { PoolConnection } from 'mysql2/promise';
import { MYSQL_POOL } from './connections/mysql-pool.token';
import { Pool } from 'mysql2/promise';

/**
 * Управляет границей одной бизнес-транзакции.
 *
 * Controller не должен вызывать этот класс напрямую: service задает границу,
 * а callback передает один `PoolConnection` нескольким repository.
 */
@Injectable()
export class UnitOfWork {
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  /**
   * Выполняет callback в транзакции и возвращает его результат.
   *
   * @param work Функция service-слоя, получающая только transaction connection.
   * @returns Результат callback после успешного commit.
   * @throws Исходную ошибку после rollback; ошибка rollback не скрывает исходную.
   */
  async run<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();
      const result = await work(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}
