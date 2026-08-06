/**
 * Результат сохранения media content в выбранный storage backend.
 */
export type MediaStorageSaveResult = {
  storageType: 'database' | 'file' | 'external';
  contentBase64: string | null;
  filePath: string | null;
  metadata: Record<string, unknown>;
};
