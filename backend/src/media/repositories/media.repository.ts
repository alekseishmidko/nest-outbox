import { Inject, Injectable } from '@nestjs/common';
import { ResultSetHeader } from 'mysql2';
import { Pool } from 'mysql2/promise';
import { MYSQL_POOL } from '../../database/connections/mysql-pool.token';
import { MediaAssetRecord } from '../types/media-asset-record.type';
import { MediaAssetRow } from '../types/media-asset-row.type';
import { MediaMapRow, MediaUserRow } from '../types/media-owner-row.type';

type CreateMediaAssetInput = {
  ownerType: 'user' | 'map' | 'order';
  ownerId: number;
  type: 'qr_code' | 'avatar';
  mimeType: string;
  storageType: 'database' | 'file' | 'external';
  contentBase64: string | null;
  filePath: string | null;
  metadata: unknown;
};

/**
 * Repository медиа.
 *
 * Содержит SQL-запросы к `media_assets`, а также минимальные read-запросы
 * к владельцам медиа для генерации контента.
 */
@Injectable()
export class MediaRepository {
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  /**
   * Возвращает минимальный набор данных пользователя для генерации avatar.
   */
  async findUserForAvatar(userId: number): Promise<MediaUserRow | null> {
    const [rows] = await this.pool.execute<MediaUserRow[]>(
      `
        SELECT
          id,
          email,
          name,
          avatar_seed
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
      [userId],
    );

    return rows[0] ?? null;
  }

  /**
   * Возвращает минимальный набор данных карты для генерации QR-code.
   */
  async findMapForQr(mapId: number): Promise<MediaMapRow | null> {
    const [rows] = await this.pool.execute<MediaMapRow[]>(
      `
        SELECT
          id,
          title,
          description,
          latitude,
          longitude,
          owner_user_id
        FROM maps
        WHERE id = ?
        LIMIT 1
      `,
      [mapId],
    );

    return rows[0] ?? null;
  }

  /**
   * Сохраняет сгенерированный media asset в `media_assets`.
   *
   * На текущем этапе основной storage mode - `database`, поэтому контент
   * хранится в `content_base64`, а технические детали генерации - в JSON metadata.
   */
  async createAsset(input: CreateMediaAssetInput): Promise<MediaAssetRecord> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `
        INSERT INTO media_assets (
          owner_type,
          owner_id,
          type,
          mime_type,
          storage_type,
          content_base64,
          file_path,
          metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        input.ownerType,
        input.ownerId,
        input.type,
        input.mimeType,
        input.storageType,
        input.contentBase64,
        input.filePath,
        JSON.stringify(input.metadata),
      ],
    );

    return this.findByIdOrThrow(result.insertId);
  }

  /**
   * Ищет media asset по идентификатору.
   */
  async findById(id: number): Promise<MediaAssetRecord | null> {
    const [rows] = await this.pool.execute<MediaAssetRow[]>(
      `
        SELECT
          id,
          owner_type,
          owner_id,
          type,
          mime_type,
          storage_type,
          content_base64,
          file_path,
          metadata,
          created_at
        FROM media_assets
        WHERE id = ?
        LIMIT 1
      `,
      [id],
    );

    return rows[0] ? this.toRecord(rows[0]) : null;
  }

  /**
   * Возвращает созданный asset или падает, если insert не дал читаемой записи.
   */
  private async findByIdOrThrow(id: number): Promise<MediaAssetRecord> {
    const asset = await this.findById(id);

    if (!asset) {
      throw new Error(`Media asset ${id} was not found after insert`);
    }

    return asset;
  }

  /**
   * Преобразует SQL-row в доменный тип и нормализует JSON metadata.
   */
  private toRecord(row: MediaAssetRow): MediaAssetRecord {
    return {
      id: row.id,
      ownerType: row.owner_type,
      ownerId: row.owner_id,
      type: row.type,
      mimeType: row.mime_type,
      storageType: row.storage_type,
      contentBase64: row.content_base64,
      filePath: row.file_path,
      metadata:
        typeof row.metadata === 'string'
          ? JSON.parse(row.metadata)
          : row.metadata,
      createdAt: row.created_at,
    };
  }
}
