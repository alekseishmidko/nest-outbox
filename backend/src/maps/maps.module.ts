import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { MapsController } from './controllers/maps.controller';
import { MapsRepository } from './repositories/maps.repository';
import { MapsService } from './services/maps.service';
import { AuditModule } from '../audit/audit.module';

/**
 * Модуль карт.
 *
 * Хранит сущности `maps`, связанные с пользователями и QR-code генерацией.
 */
@Module({
  imports: [DatabaseModule, UsersModule, AuthModule, AuditModule],
  controllers: [MapsController],
  providers: [MapsRepository, MapsService],
  exports: [MapsService, MapsRepository],
})
export class MapsModule {}
