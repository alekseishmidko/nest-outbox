import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { TransactionsLabController } from './controllers/transactions-lab.controller';
import { TransactionsLabRepository } from './repositories/transactions-lab.repository';
import { TransactionsLabService } from './services/transactions-lab.service';

/**
 * Учебный модуль конкурентных транзакций.
 *
 * Цель: объединить API, service и repository для практики isolation levels,
 * аномалий чтения и deadlock simulation на реальной MySQL/InnoDB базе.
 * Модуль не принимает входных параметров и экспортирует HTTP endpoints.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [TransactionsLabController],
  providers: [TransactionsLabRepository, TransactionsLabService],
})
export class TransactionsLabModule {}
