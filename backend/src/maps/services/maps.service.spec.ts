import { NotFoundException } from '@nestjs/common';
import { MapsRepository } from '../repositories/maps.repository';
import { MapsService } from './maps.service';

describe('MapsService', () => {
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
});
