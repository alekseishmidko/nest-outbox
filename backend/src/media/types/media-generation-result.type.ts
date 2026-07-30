import { MediaAssetRecord } from './media-asset-record.type';

/**
 * Результат генерации медиа.
 */
export type MediaGenerationResult = {
  asset: MediaAssetRecord;
  dataUrl: string;
};
