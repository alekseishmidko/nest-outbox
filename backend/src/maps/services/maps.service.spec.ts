import { NotFoundException } from '@nestjs/common';
import { MapsRepository } from '../repositories/maps.repository';
import { MapsService } from './maps.service';

describe('MapsService', () => {
  it('создает карту после проверки владельца', async () => {
    const map = {
      id: 1,
      title: 'Central Park QR map',
      description: 'Точка для генерации QR-code.',
      latitude: '40.78509100',
      longitude: '-73.96828500',
      ownerUserId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const mapsRepository = {
      create: jest.fn().mockResolvedValue(map),
    };
    const usersService = {
      findById: jest.fn().mockResolvedValue({ id: 1 }),
    };
    const service = new MapsService(
      mapsRepository as unknown as MapsRepository,
      usersService as never,
    );

    await expect(
      service.create({
        title: map.title,
        description: map.description,
        latitude: 40.785091,
        longitude: -73.968285,
        ownerUserId: 1,
      }),
    ).resolves.toEqual(map);

    expect(usersService.findById).toHaveBeenCalledWith(1);
    expect(mapsRepository.create).toHaveBeenCalled();
  });

  it('не создает карту, если пользователь-владелец не найден', async () => {
    const mapsRepository = {
      create: jest.fn(),
    };
    const usersService = {
      findById: jest
        .fn()
        .mockRejectedValue(new NotFoundException('Пользователь 1 не найден')),
    };
    const service = new MapsService(
      mapsRepository as unknown as MapsRepository,
      usersService as never,
    );

    await expect(
      service.create({
        title: 'Central Park QR map',
        description: 'Точка для генерации QR-code.',
        latitude: 40.785091,
        longitude: -73.968285,
        ownerUserId: 1,
      }),
    ).rejects.toThrow(NotFoundException);

    expect(usersService.findById).toHaveBeenCalledWith(1);
    expect(mapsRepository.create).not.toHaveBeenCalled();
  });

  it('возвращает 404, если карта не найдена', async () => {
    const mapsRepository = {
      findById: jest.fn().mockResolvedValue(null),
    };
    const service = new MapsService(
      mapsRepository as unknown as MapsRepository,
      {} as never,
    );

    await expect(service.findById(404)).rejects.toThrow(NotFoundException);
  });
});
