import { NotFoundException } from '@nestjs/common';

jest.mock('../generators/avatar.generator', () => ({
  AvatarGenerator: class AvatarGenerator {},
}));

import { AvatarGenerator } from '../generators/avatar.generator';
import { QrCodeGenerator } from '../generators/qr-code.generator';
import { MediaRepository } from '../repositories/media.repository';
import { MediaStorageService } from '../storage/media-storage.service';
import { MediaService } from './media.service';

describe('MediaService', () => {
  it('генерирует avatar пользователя и сохраняет asset', async () => {
    const asset = {
      id: 1,
      ownerType: 'user' as const,
      ownerId: 10,
      type: 'avatar' as const,
      mimeType: 'image/svg+xml',
      storageType: 'database' as const,
      contentBase64: Buffer.from('<svg />').toString('base64'),
      filePath: null,
      metadata: {},
      createdAt: new Date(),
    };
    const repository = {
      findUserForAvatar: jest.fn().mockResolvedValue({
        id: 10,
        email: 'user@example.com',
        name: 'User',
        avatar_seed: 'db-seed',
      }),
      findExistingUserAvatar: jest.fn().mockResolvedValue(null),
      createAsset: jest.fn().mockResolvedValue(asset),
    };
    const avatarGenerator = {
      generateSvg: jest.fn().mockReturnValue('<svg />'),
    };
    const mediaStorageService = {
      save: jest.fn().mockResolvedValue({
        storageType: 'database',
        contentBase64: Buffer.from('<svg />').toString('base64'),
        filePath: null,
        metadata: {},
      }),
    };
    const service = new MediaService(
      repository as unknown as MediaRepository,
      avatarGenerator as unknown as AvatarGenerator,
      {} as unknown as QrCodeGenerator,
      mediaStorageService as unknown as MediaStorageService,
    );

    const result = await service.generateUserAvatar(10, { seed: 'dto-seed' });

    expect(avatarGenerator.generateSvg).toHaveBeenCalledWith('dto-seed');
    expect(mediaStorageService.save).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerType: 'user',
        ownerId: 10,
        type: 'avatar',
        mimeType: 'image/svg+xml',
        content: expect.any(Buffer),
      }),
    );
    expect(repository.createAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerType: 'user',
        ownerId: 10,
        type: 'avatar',
        mimeType: 'image/svg+xml',
      }),
    );
    expect(result.asset).toEqual(asset);
    expect(result.dataUrl).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it('генерирует QR-code карты и сохраняет asset', async () => {
    const asset = {
      id: 2,
      ownerType: 'map' as const,
      ownerId: 20,
      type: 'qr_code' as const,
      mimeType: 'image/png',
      storageType: 'database' as const,
      contentBase64: 'base64',
      filePath: null,
      metadata: {},
      createdAt: new Date(),
    };
    const repository = {
      findMapForQr: jest.fn().mockResolvedValue({
        id: 20,
        title: 'Map',
        description: null,
        latitude: '40.78509100',
        longitude: '-73.96828500',
        owner_user_id: 10,
      }),
      findExistingMapQr: jest.fn().mockResolvedValue(null),
      createAsset: jest.fn().mockResolvedValue(asset),
    };
    const qrCodeGenerator = {
      generateDataUrl: jest
        .fn()
        .mockResolvedValue('data:image/png;base64,base64'),
    };
    const mediaStorageService = {
      save: jest.fn().mockResolvedValue({
        storageType: 'database',
        contentBase64: 'base64',
        filePath: null,
        metadata: {},
      }),
    };
    const service = new MediaService(
      repository as unknown as MediaRepository,
      {} as unknown as AvatarGenerator,
      qrCodeGenerator as unknown as QrCodeGenerator,
      mediaStorageService as unknown as MediaStorageService,
    );

    const result = await service.generateMapQr(20, { payload: 'payload' });

    expect(qrCodeGenerator.generateDataUrl).toHaveBeenCalledWith('payload');
    expect(mediaStorageService.save).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerType: 'map',
        ownerId: 20,
        type: 'qr_code',
        mimeType: 'image/png',
        content: expect.any(Buffer),
      }),
    );
    expect(repository.createAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerType: 'map',
        ownerId: 20,
        type: 'qr_code',
        contentBase64: 'base64',
      }),
    );
    expect(result.dataUrl).toBe('data:image/png;base64,base64');
  });

  it('возвращает 404, если владелец media не найден', async () => {
    const repository = {
      findUserForAvatar: jest.fn().mockResolvedValue(null),
    };
    const service = new MediaService(
      repository as unknown as MediaRepository,
      {} as unknown as AvatarGenerator,
      {} as unknown as QrCodeGenerator,
      {} as unknown as MediaStorageService,
    );

    await expect(service.generateUserAvatar(999)).rejects.toThrow(
      NotFoundException,
    );
  });
});
