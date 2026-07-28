import { Module } from '@nestjs/common';
import { MYSQL_POOL } from './connections/mysql-pool.token';
import { createMysqlPoolProvider } from './connections/mysql-pool.provider';
import { DatabaseService } from './database.service';

const mysqlPoolProvider = createMysqlPoolProvider();

/**
 * Модуль базы данных.
 *
 * Управляет MySQL connection pool, транзакциями и SQL migration runner.
 */
@Module({
  providers: [mysqlPoolProvider, DatabaseService],
  exports: [MYSQL_POOL, DatabaseService],
})
export class DatabaseModule {}
