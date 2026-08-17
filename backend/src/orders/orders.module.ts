import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { MapsModule } from '../maps/maps.module';
import { UsersModule } from '../users/users.module';
import { OrdersController } from './controllers/orders.controller';
import { OrdersRepository } from './repositories/orders.repository';
import { OrdersService } from './services/orders.service';

/**
 * Модуль заказов.
 *
 * Используется для тренировки транзакций и записи Outbox-событий.
 */
@Module({
  imports: [DatabaseModule, MapsModule, UsersModule, AuthModule],
  controllers: [OrdersController],
  providers: [OrdersRepository, OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
