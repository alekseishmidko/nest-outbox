import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { InboxController } from './controllers/inbox.controller';
import { InboxRepository } from './repositories/inbox.repository';
import { InboxService } from './services/inbox.service';
import { InboxWorker } from './workers/inbox-worker';

/** Модуль Inbox для приема и повторяемой обработки входящих событий. */
@Module({
  imports: [DatabaseModule],
  controllers: [InboxController],
  providers: [InboxRepository, InboxService, InboxWorker],
  exports: [InboxRepository, InboxService],
})
export class InboxModule {}
