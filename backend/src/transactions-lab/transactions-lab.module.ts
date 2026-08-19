import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { MapsModule } from '../maps/maps.module';
import { UsersModule } from '../users/users.module';
import { TransactionsLabController } from './controllers/transactions-lab.controller';
import { TransactionsLabRepository } from './repositories/transactions-lab.repository';
import { TransactionsLabService } from './services/transactions-lab.service';
import { TransactionBoundaryService } from './services/transaction-boundary.service';

/**
 * Учебный модуль конкурентных транзакций.
 *
 * Цель: объединить API, service и repository для практики isolation levels,
 * аномалий чтения и deadlock simulation на реальной MySQL/InnoDB базе.
 * Модуль не принимает входных параметров и экспортирует HTTP endpoints.
 */
@Module({
  imports: [DatabaseModule, MapsModule, UsersModule],
  controllers: [TransactionsLabController],
  providers: [
    TransactionsLabRepository,
    TransactionsLabService,
    TransactionBoundaryService,
  ],
})
export class TransactionsLabModule {}
