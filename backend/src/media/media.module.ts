import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { MediaController } from './controllers/media.controller';
import { AvatarGenerator } from './generators/avatar.generator';
import { QrCodeGenerator } from './generators/qr-code.generator';
import { MediaRepository } from './repositories/media.repository';
import { MediaService } from './services/media.service';
import { MediaStorageService } from './storage/media-storage.service';
import { DomainEventOutboxWriter } from '../outbox/domain-event-outbox-writer';
import { SecurityModule } from '../security/security.module';

/**
 * Модуль медиа.
 *
 * Отвечает за генерацию и хранение QR-code и avatar.
 */
@Module({
  imports: [DatabaseModule, AuthModule, SecurityModule],
  controllers: [MediaController],
  providers: [
    AvatarGenerator,
    QrCodeGenerator,
    MediaRepository,
    MediaService,
    MediaStorageService,
    DomainEventOutboxWriter,
  ],
  exports: [MediaService],
})
export class MediaModule {}
