import { z } from 'zod';

/**
 * Схема env-переменных для хранения media assets.
 */
export const mediaStorageConfigSchema = z.object({
  MEDIA_STORAGE_MODE: z
    .enum(['database', 'local-file', 's3-compatible'])
    .default('database'),
  MEDIA_LOCAL_STORAGE_DIR: z.string().min(1).default('/app/storage/media'),
  MEDIA_PUBLIC_BASE_URL: z.string().optional(),
  S3_ENDPOINT: z.string().url().default('http://minio:9000'),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_BUCKET: z.string().min(1).default('media-assets'),
  S3_ACCESS_KEY_ID: z.string().min(1).default('minioadmin'),
  S3_SECRET_ACCESS_KEY: z.string().min(1).default('minioadmin'),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
});

export type MediaStorageConfig = z.infer<typeof mediaStorageConfigSchema>;

/**
 * Возвращает валидированную конфигурацию media storage.
 */
export function parseMediaStorageConfig(): MediaStorageConfig {
  return mediaStorageConfigSchema.parse(process.env);
}
