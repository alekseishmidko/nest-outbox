import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { TransactionsLabController } from './controllers/transactions-lab.controller';
import { TransactionsLabRepository } from './repositories/transactions-lab.repository';
import { TransactionsLabService } from './services/transactions-lab.service';

/**
 * Учебный модуль конкурентных транзакций.
 *
 * Нужен для практики isolation levels, аномалий чтения и deadlock simulation
 * на реальной MySQL/InnoDB базе.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [TransactionsLabController],
  providers: [TransactionsLabRepository, TransactionsLabService],
})
export class TransactionsLabModule {}
