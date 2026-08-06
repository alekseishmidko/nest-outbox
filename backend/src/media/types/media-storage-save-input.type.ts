/**
 * Входные данные для сохранения сгенерированного media content.
 */
export type MediaStorageSaveInput = {
  ownerType: 'user' | 'map' | 'order';
  ownerId: number;
  type: 'qr_code' | 'avatar';
  mimeType: string;
  content: Buffer;
  metadata: Record<string, unknown>;
};
