import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { MediaController } from './controllers/media.controller';
import { AvatarGenerator } from './generators/avatar.generator';
import { QrCodeGenerator } from './generators/qr-code.generator';
import { MediaRepository } from './repositories/media.repository';
import { MediaService } from './services/media.service';

/**
 * Модуль медиа.
 *
 * Отвечает за генерацию и хранение QR-code и avatar.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [MediaController],
  providers: [AvatarGenerator, QrCodeGenerator, MediaRepository, MediaService],
  exports: [MediaService],
})
export class MediaModule {}
