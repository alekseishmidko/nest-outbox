import { Injectable, NotFoundException } from '@nestjs/common';
import { GenerateMapQrDto } from '../dto/generate-map-qr.dto';
import { GenerateUserAvatarDto } from '../dto/generate-user-avatar.dto';
import { AvatarGenerator } from '../generators/avatar.generator';
import { QrCodeGenerator } from '../generators/qr-code.generator';
import { MediaRepository } from '../repositories/media.repository';
import { MediaStorageService } from '../storage/media-storage.service';
import { MediaAssetRecord } from '../types/media-asset-record.type';
import { MediaGenerationResult } from '../types/media-generation-result.type';

/**
 * Сервис медиа.
 *
 * Изолирует генерацию QR-code/avatar и сохранение результата в `media_assets`.
 */
@Injectable()
export class MediaService {
  constructor(
    private readonly mediaRepository: MediaRepository,
    private readonly avatarGenerator: AvatarGenerator,
    private readonly qrCodeGenerator: QrCodeGenerator,
    private readonly mediaStorageService: MediaStorageService,
  ) {}

  /**
   * Генерирует avatar для пользователя и сохраняет asset.
   */
  async generateUserAvatar(
    userId: number,
    dto: GenerateUserAvatarDto = {},
  ): Promise<MediaGenerationResult> {
    const user = await this.mediaRepository.findUserForAvatar(userId);

    if (!user) {
      throw new NotFoundException(`Пользователь ${userId} не найден`);
    }

    const seed = dto.seed ?? user.avatar_seed;
    const svg = this.avatarGenerator.generateSvg(seed);
    const content = Buffer.from(svg, 'utf8');
    const storage = await this.mediaStorageService.save({
      ownerType: 'user',
      ownerId: userId,
      type: 'avatar',
      mimeType: 'image/svg+xml',
      content,
      metadata: {
        generator: 'dicebear',
        style: 'identicon',
        seed,
        userEmail: user.email,
      },
    });
    const asset = await this.mediaRepository.createAsset({
      ownerType: 'user',
      ownerId: userId,
      type: 'avatar',
      mimeType: 'image/svg+xml',
      storageType: storage.storageType,
      contentBase64: storage.contentBase64,
      filePath: storage.filePath,
      metadata: storage.metadata,
    });

    return {
      asset,
      dataUrl: this.toDataUrlFromContent(asset.mimeType, content),
    };
  }

  /**
   * Генерирует QR-code для карты и сохраняет asset.
   */
  async generateMapQr(
    mapId: number,
    dto: GenerateMapQrDto = {},
  ): Promise<MediaGenerationResult> {
    const map = await this.mediaRepository.findMapForQr(mapId);

    if (!map) {
      throw new NotFoundException(`Карта ${mapId} не найдена`);
    }

    const payload =
      dto.url ??
      dto.payload ??
      JSON.stringify({
        type: 'map',
        mapId: map.id,
        title: map.title,
        latitude: map.latitude,
        longitude: map.longitude,
      });
    const dataUrl = await this.qrCodeGenerator.generateDataUrl(payload);
    const content = Buffer.from(this.extractBase64(dataUrl), 'base64');
    const storage = await this.mediaStorageService.save({
      ownerType: 'map',
      ownerId: mapId,
      type: 'qr_code',
      mimeType: 'image/png',
      content,
      metadata: {
        generator: 'qrcode',
        payload,
        mapTitle: map.title,
        ownerUserId: map.owner_user_id,
      },
    });
    const asset = await this.mediaRepository.createAsset({
      ownerType: 'map',
      ownerId: mapId,
      type: 'qr_code',
      mimeType: 'image/png',
      storageType: storage.storageType,
      contentBase64: storage.contentBase64,
      filePath: storage.filePath,
      metadata: storage.metadata,
    });

    return {
      asset,
      dataUrl,
    };
  }

  /**
   * Возвращает сохраненный media asset.
   */
  async findById(id: number): Promise<MediaAssetRecord> {
    const asset = await this.mediaRepository.findById(id);

    if (!asset) {
      throw new NotFoundException(`Media asset ${id} не найден`);
    }

    return asset;
  }

  /**
   * Возвращает data URL для asset, если он хранится в БД.
   */
  toDataUrl(asset: MediaAssetRecord): string {
    if (!asset.contentBase64) {
      return '';
    }

    return `data:${asset.mimeType};base64,${asset.contentBase64}`;
  }

  private extractBase64(dataUrl: string): string {
    return dataUrl.split(',')[1] ?? dataUrl;
  }

  /**
   * Возвращает data URL из исходного content независимо от storage backend.
   */
  private toDataUrlFromContent(mimeType: string, content: Buffer): string {
    return `data:${mimeType};base64,${content.toString('base64')}`;
  }
}
