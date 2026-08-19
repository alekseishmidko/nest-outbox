import { Module } from '@nestjs/common';
import { MYSQL_POOL } from './connections/mysql-pool.token';
import { createMysqlPoolProvider } from './connections/mysql-pool.provider';
import { DatabaseService } from './database.service';
import { UnitOfWork } from './unit-of-work';

const mysqlPoolProvider = createMysqlPoolProvider();

/**
 * Модуль базы данных.
 *
 * Управляет MySQL connection pool, транзакциями и SQL migration runner.
 */
@Module({
  providers: [mysqlPoolProvider, DatabaseService, UnitOfWork],
  exports: [MYSQL_POOL, DatabaseService, UnitOfWork],
})
export class DatabaseModule {}
