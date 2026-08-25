import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { MapsModule } from '../maps/maps.module';
import { UsersModule } from '../users/users.module';
import { OrdersController } from './controllers/orders.controller';
import { OrdersRepository } from './repositories/orders.repository';
import { OrdersService } from './services/orders.service';
import { CreateOrderHandler } from './commands/create-order.handler';
import { UpdateOrderStatusHandler } from './commands/update-order-status.handler';
import {
  ListOrdersQueryHandler,
  OrderOverviewQueryHandler,
} from './queries/orders-query.handlers';
import { AuditModule } from '../audit/audit.module';

/**
 * Модуль заказов.
 *
 * Используется для тренировки транзакций и записи Outbox-событий.
 */
@Module({
  imports: [DatabaseModule, MapsModule, UsersModule, AuthModule, AuditModule],
  controllers: [OrdersController],
  providers: [
    OrdersRepository,
    OrdersService,
    CreateOrderHandler,
    UpdateOrderStatusHandler,
    ListOrdersQueryHandler,
    OrderOverviewQueryHandler,
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
