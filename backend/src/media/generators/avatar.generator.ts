import { Injectable } from '@nestjs/common';
import { createAvatar } from '@dicebear/core';
import { identicon } from '@dicebear/collection';

/**
 * Генератор avatar.
 */
@Injectable()
export class AvatarGenerator {
  /**
   * Генерирует SVG avatar по seed.
   */
  generateSvg(seed: string): string {
    return createAvatar(identicon, {
      seed,
      size: 256,
    }).toString();
  }
}
