import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MediaStorageService } from './media-storage.service';

describe('MediaStorageService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('сохраняет media content в database mode', async () => {
    process.env.MEDIA_STORAGE_MODE = 'database';
    const service = new MediaStorageService();

    const result = await service.save({
      ownerType: 'user',
      ownerId: 1,
      type: 'avatar',
      mimeType: 'image/svg+xml',
      content: Buffer.from('<svg />'),
      metadata: {
        generator: 'test',
      },
    });

    expect(result).toEqual({
      storageType: 'database',
      contentBase64: Buffer.from('<svg />').toString('base64'),
      filePath: null,
      metadata: {
        generator: 'test',
        storageMode: 'database',
      },
    });
  });

  it('сохраняет media content в local-file mode', async () => {
    const storageDir = await mkdtemp(join(tmpdir(), 'media-storage-'));

    process.env.MEDIA_STORAGE_MODE = 'local-file';
    process.env.MEDIA_LOCAL_STORAGE_DIR = storageDir;
    process.env.MEDIA_PUBLIC_BASE_URL = 'http://localhost:3000/media-files';

    try {
      const service = new MediaStorageService();
      const content = Buffer.from('png-bytes');
      const result = await service.save({
        ownerType: 'map',
        ownerId: 10,
        type: 'qr_code',
        mimeType: 'image/png',
        content,
        metadata: {
          generator: 'test',
        },
      });

      expect(result.storageType).toBe('file');
      expect(result.contentBase64).toBeNull();
      expect(result.filePath).toEqual(expect.stringContaining(storageDir));
      expect(result.metadata).toEqual(
        expect.objectContaining({
          storageMode: 'local-file',
          objectKey: expect.stringContaining('map/10/qr_code-'),
          publicUrl: expect.stringContaining(
            'http://localhost:3000/media-files/map/10/qr_code-',
          ),
        }),
      );
      await expect(readFile(result.filePath as string)).resolves.toEqual(
        content,
      );
    } finally {
      await rm(storageDir, { recursive: true, force: true });
    }
  });
});
