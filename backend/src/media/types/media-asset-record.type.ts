/**
 * Доменное представление сохраненного медиа-asset.
 */
export type MediaAssetRecord = {
  id: number;
  ownerType: 'user' | 'map' | 'order';
  ownerId: number;
  type: 'qr_code' | 'avatar';
  mimeType: string;
  storageType: 'database' | 'file' | 'external';
  contentBase64: string | null;
  filePath: string | null;
  metadata: unknown;
  createdAt: Date;
};
