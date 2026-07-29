import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { MapsController } from './controllers/maps.controller';
import { MapsRepository } from './repositories/maps.repository';
import { MapsService } from './services/maps.service';

/**
 * Модуль карт.
 *
 * Хранит сущности `maps`, связанные с пользователями и QR-code генерацией.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [MapsController],
  providers: [MapsRepository, MapsService],
  exports: [MapsService],
})
export class MapsModule {}
