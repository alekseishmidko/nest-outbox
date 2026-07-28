import { Module } from '@nestjs/common';

/**
 * Модуль Outbox.
 *
 * Обрабатывает события из таблицы `outbox_events` без брокера сообщений.
 */
@Module({})
export class OutboxModule {}
