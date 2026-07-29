import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { OutboxController } from './controllers/outbox.controller';
import { OutboxRepository } from './repositories/outbox.repository';
import { OutboxService } from './services/outbox.service';

/**
 * Модуль Outbox.
 *
 * Обрабатывает события из таблицы `outbox_events` без брокера сообщений.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [OutboxController],
  providers: [OutboxRepository, OutboxService],
  exports: [OutboxService],
})
export class OutboxModule {}
