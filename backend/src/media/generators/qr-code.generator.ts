import { Injectable } from '@nestjs/common';
import * as QRCode from 'qrcode';

/**
 * Генератор QR-code.
 */
@Injectable()
export class QrCodeGenerator {
  /**
   * Генерирует PNG QR-code в формате data URL.
   */
  async generateDataUrl(payload: string): Promise<string> {
    return QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'M',
      margin: 2,
      scale: 8,
      type: 'image/png',
    });
  }
}
