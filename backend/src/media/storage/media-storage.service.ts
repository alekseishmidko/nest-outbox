import { Injectable } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { dirname, extname, join } from 'node:path';
import {
  MediaStorageConfig,
  parseMediaStorageConfig,
} from '../config/media-storage.config';
import { MediaStorageSaveInput } from '../types/media-storage-save-input.type';
import { MediaStorageSaveResult } from '../types/media-storage-save-result.type';

/**
 * Слой хранения media assets.
 *
 * Сервис инкапсулирует детали хранения: база данных, локальная файловая система
 * или S3-compatible backend. HTTP/controller слой не выбирает storage backend.
 */
@Injectable()
export class MediaStorageService {
  private readonly config: MediaStorageConfig;

  constructor() {
    this.config = parseMediaStorageConfig();
  }

  /**
   * Сохраняет media content в storage backend, выбранный через env.
   */
  async save(input: MediaStorageSaveInput): Promise<MediaStorageSaveResult> {
    if (this.config.MEDIA_STORAGE_MODE === 'database') {
      return this.saveToDatabase(input);
    }

    if (this.config.MEDIA_STORAGE_MODE === 'local-file') {
      return this.saveToLocalFile(input);
    }

    return this.saveToS3Compatible(input);
  }

  /**
   * Сохраняет content как base64 прямо в `media_assets.content_base64`.
   */
  private saveToDatabase(input: MediaStorageSaveInput): MediaStorageSaveResult {
    return {
      storageType: 'database',
      contentBase64: input.content.toString('base64'),
      filePath: null,
      metadata: {
        ...input.metadata,
        storageMode: this.config.MEDIA_STORAGE_MODE,
      },
    };
  }

  /**
   * Сохраняет content в локальный каталог контейнера.
   */
  private async saveToLocalFile(
    input: MediaStorageSaveInput,
  ): Promise<MediaStorageSaveResult> {
    const objectKey = this.createObjectKey(input);
    const absolutePath = join(this.config.MEDIA_LOCAL_STORAGE_DIR, objectKey);

    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, input.content);

    return {
      storageType: 'file',
      contentBase64: null,
      filePath: absolutePath,
      metadata: {
        ...input.metadata,
        storageMode: this.config.MEDIA_STORAGE_MODE,
        objectKey,
        publicUrl: this.toPublicUrl(objectKey),
      },
    };
  }

  /**
   * Сохраняет content в S3-compatible backend, например MinIO.
   */
  private async saveToS3Compatible(
    input: MediaStorageSaveInput,
  ): Promise<MediaStorageSaveResult> {
    const objectKey = this.createObjectKey(input);

    await this.putS3Object(objectKey, input);

    return {
      storageType: 'external',
      contentBase64: null,
      filePath: objectKey,
      metadata: {
        ...input.metadata,
        storageMode: this.config.MEDIA_STORAGE_MODE,
        bucket: this.config.S3_BUCKET,
        objectKey,
        endpoint: this.config.S3_ENDPOINT,
        publicUrl: this.toPublicUrl(objectKey),
      },
    };
  }

  /**
   * Выполняет S3 PUT Object с AWS Signature V4.
   */
  private async putS3Object(
    objectKey: string,
    input: MediaStorageSaveInput,
  ): Promise<void> {
    const endpoint = new URL(this.config.S3_ENDPOINT);
    const requestUrl = this.createS3ObjectUrl(endpoint, objectKey);
    const now = new Date();
    const amzDate = this.toAmzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = this.sha256Hex(input.content);
    const canonicalUri = this.createCanonicalUri(objectKey);
    const headers = {
      host: requestUrl.host,
      'content-type': input.mimeType,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    };
    const signedHeaders = Object.keys(headers).sort().join(';');
    const canonicalHeaders = Object.entries(headers)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}:${value}\n`)
      .join('');
    const canonicalRequest = [
      'PUT',
      canonicalUri,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');
    const credentialScope = `${dateStamp}/${this.config.S3_REGION}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      this.sha256Hex(Buffer.from(canonicalRequest, 'utf8')),
    ].join('\n');
    const signature = this.hmacHex(this.getSigningKey(dateStamp), stringToSign);
    const authorization = [
      `AWS4-HMAC-SHA256 Credential=${this.config.S3_ACCESS_KEY_ID}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`,
    ].join(', ');
    const response = await fetch(requestUrl, {
      method: 'PUT',
      headers: {
        ...headers,
        authorization,
      },
      body: this.toArrayBuffer(input.content),
    });

    if (!response.ok) {
      throw new Error(
        `S3-compatible upload failed: status=${response.status}, body=${await response.text()}`,
      );
    }
  }

  /**
   * Создает стабильный object key для storage backend.
   */
  private createObjectKey(input: MediaStorageSaveInput): string {
    return [
      input.ownerType,
      String(input.ownerId),
      `${input.type}-${Date.now()}-${randomUUID()}${this.getExtension(input.mimeType)}`,
    ].join('/');
  }

  /**
   * Возвращает расширение файла по MIME type.
   */
  private getExtension(mimeType: string): string {
    if (mimeType === 'image/svg+xml') {
      return '.svg';
    }

    if (mimeType === 'image/png') {
      return '.png';
    }

    return extname(mimeType) || '.bin';
  }

  /**
   * Формирует публичный URL, если он настроен.
   */
  private toPublicUrl(objectKey: string): string | null {
    if (!this.config.MEDIA_PUBLIC_BASE_URL) {
      return null;
    }

    return `${this.config.MEDIA_PUBLIC_BASE_URL.replace(/\/$/, '')}/${objectKey}`;
  }

  /**
   * Создает URL объекта с path-style или virtual-hosted-style адресацией.
   */
  private createS3ObjectUrl(endpoint: URL, objectKey: string): URL {
    if (this.config.S3_FORCE_PATH_STYLE) {
      return new URL(
        `${this.config.S3_BUCKET}/${objectKey}`,
        `${endpoint.origin}/`,
      );
    }

    return new URL(
      `${endpoint.protocol}//${this.config.S3_BUCKET}.${endpoint.host}/${objectKey}`,
    );
  }

  /**
   * Создает canonical URI для AWS Signature V4.
   */
  private createCanonicalUri(objectKey: string): string {
    const encodedKey = objectKey
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/');

    return this.config.S3_FORCE_PATH_STYLE
      ? `/${this.config.S3_BUCKET}/${encodedKey}`
      : `/${encodedKey}`;
  }

  /**
   * Форматирует дату в `YYYYMMDDTHHmmssZ`.
   */
  private toAmzDate(date: Date): string {
    return date.toISOString().replaceAll(/[:-]|\.\d{3}/g, '');
  }

  /**
   * Возвращает SHA256 в hex-формате.
   */
  private sha256Hex(value: Buffer | string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  /**
   * Преобразует Buffer в ArrayBuffer для fetch BodyInit.
   */
  private toArrayBuffer(buffer: Buffer): ArrayBuffer {
    return buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;
  }

  /**
   * Возвращает HMAC-SHA256 как raw bytes.
   */
  private hmac(key: Buffer | string, value: string): Buffer {
    return createHmac('sha256', key).update(value).digest();
  }

  /**
   * Возвращает HMAC-SHA256 в hex-формате.
   */
  private hmacHex(key: Buffer, value: string): string {
    return createHmac('sha256', key).update(value).digest('hex');
  }

  /**
   * Возвращает ключ подписи для AWS Signature V4.
   */
  private getSigningKey(dateStamp: string): Buffer {
    const dateKey = this.hmac(
      `AWS4${this.config.S3_SECRET_ACCESS_KEY}`,
      dateStamp,
    );
    const regionKey = this.hmac(dateKey, this.config.S3_REGION);
    const serviceKey = this.hmac(regionKey, 's3');

    return this.hmac(serviceKey, 'aws4_request');
  }
}
