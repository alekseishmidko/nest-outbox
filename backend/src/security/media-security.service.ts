import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import { isAbsolute, relative } from 'node:path';

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/svg+xml']);

/** Проверяет размер, MIME/content и выполняет antivirus hook перед сохранением. */
@Injectable()
export class MediaSecurityService {
  private readonly maxBytes = Number(
    process.env.MEDIA_MAX_BYTES ?? DEFAULT_MAX_BYTES,
  );

  validate(content: Buffer, mimeType: string): void {
    if (content.byteLength > this.maxBytes)
      throw new PayloadTooLargeException(
        'Media-файл превышает допустимый размер',
      );
    if (!ALLOWED_MIME_TYPES.has(mimeType))
      throw new BadRequestException('Недопустимый MIME type media-файла');
    if (
      mimeType === 'image/png' &&
      !content
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      throw new BadRequestException('Содержимое не соответствует image/png');
    if (mimeType === 'image/svg+xml') {
      const value = content.toString('utf8').trim();
      if (
        !value.toLowerCase().startsWith('<svg') ||
        /<script|javascript:|on[a-z]+\s*=|<!entity/i.test(value)
      )
        throw new BadRequestException(
          'Содержимое SVG не прошло проверку безопасности',
        );
    }
    this.antivirusHook(content);
  }

  assertSafePath(root: string, target: string): void {
    const relativePath = relative(root, target);
    if (
      !isAbsolute(root) ||
      relativePath.startsWith('..') ||
      isAbsolute(relativePath)
    )
      throw new BadRequestException('Недопустимый путь media-файла');
  }

  /** Точка расширения для ClamAV/внешнего scanner. */
  private antivirusHook(content: Buffer): void {
    if (content.includes(Buffer.from('EICAR-STANDARD-ANTIVIRUS-TEST-FILE')))
      throw new BadRequestException('Antivirus scan отклонил media-файл');
  }
}
