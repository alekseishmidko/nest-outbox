import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RoutesController } from './controllers/routes.controller';
import { RoutesRepository } from './repositories/routes.repository';
import { RoutesService } from './services/routes.service';
import { RedisModule } from '../redis/redis.module';

/** Модуль геодезических расстояний и подбора direct route. */
@Module({
  imports: [DatabaseModule, RedisModule],
  controllers: [RoutesController],
  providers: [RoutesRepository, RoutesService],
})
export class RoutesModule {}
