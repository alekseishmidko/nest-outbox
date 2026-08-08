import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ReportsController } from './controllers/reports.controller';
import { ReportsRepository } from './repositories/reports.repository';
import { ReportsService } from './services/reports.service';

/**
 * Модуль аналитических отчетов.
 *
 * Нужен для тренировки SQL-оптимизации, `GROUP BY`, window functions,
 * covering indexes и сравнения offset/cursor pagination.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [ReportsController],
  providers: [ReportsRepository, ReportsService],
})
export class ReportsModule {}
