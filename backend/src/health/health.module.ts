import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { HealthController } from './controllers/health.controller';
import { HealthService } from './services/health.service';

/**
 * Модуль health-check.
 *
 * Предоставляет endpoints для проверки состояния приложения и инфраструктуры.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
