import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { MediaModule } from '../media/media.module';
import { OutboxController } from './controllers/outbox.controller';
import { OrderCreatedOutboxHandler } from './handlers/order-created-outbox.handler';
import { OrderProcessManager } from './handlers/order-process-manager';
import { OrderSagaRepository } from '../orders/sagas/order-saga.repository';
import { OutboxRepository } from './repositories/outbox.repository';
import { OutboxService } from './services/outbox.service';
import { OutboxPublisher } from './workers/outbox-publisher';

/**
 * Модуль Outbox.
 *
 * Обрабатывает события из таблицы `outbox_events` без брокера сообщений.
 */
@Module({
  imports: [DatabaseModule, MediaModule, AuthModule],
  controllers: [OutboxController],
  providers: [
    OrderCreatedOutboxHandler,
    OrderProcessManager,
    OrderSagaRepository,
    OutboxPublisher,
    OutboxRepository,
    OutboxService,
  ],
  exports: [OutboxService],
})
export class OutboxModule {}
