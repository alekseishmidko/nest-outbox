import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { HealthController } from './controllers/health.controller';
import { HealthService } from './services/health.service';
import { MediaModule } from '../media/media.module';
import { OutboxModule } from '../outbox/outbox.module';
import { RedisModule } from '../redis/redis.module';

/**
 * Модуль health-check.
 *
 * Предоставляет endpoints для проверки состояния приложения и инфраструктуры.
 */
@Module({
  imports: [DatabaseModule, MediaModule, OutboxModule, RedisModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
