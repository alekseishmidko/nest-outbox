import { ConflictException, NotFoundException } from '@nestjs/common';
import { UsersRepository } from '../repositories/users.repository';
import { UsersService } from './users.service';

describe('UsersService', () => {
  it('создает пользователя через repository', async () => {
    const user = {
      id: 1,
      email: 'user@example.com',
      name: 'User',
      avatarSeed: 'seed',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const repository = {
      create: jest.fn().mockResolvedValue(user),
    };
    const service = new UsersService(repository as unknown as UsersRepository);

    await expect(
      service.create({
        email: user.email,
        name: user.name,
        avatarSeed: user.avatarSeed,
      }),
    ).resolves.toEqual(user);

    expect(repository.create).toHaveBeenCalledWith({
      email: user.email,
      name: user.name,
      avatarSeed: user.avatarSeed,
    });
  });

  it('возвращает 409 при дублировании email', async () => {
    const repository = {
      create: jest.fn().mockRejectedValue({ code: 'ER_DUP_ENTRY' }),
    };
    const service = new UsersService(repository as unknown as UsersRepository);

    await expect(
      service.create({
        email: 'user@example.com',
        name: 'User',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('возвращает 404, если пользователь не найден', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(null),
    };
    const service = new UsersService(repository as unknown as UsersRepository);

    await expect(service.findById(999)).rejects.toThrow(NotFoundException);
  });

  it('возвращает 409 при удалении связанного пользователя', async () => {
    const repository = {
      delete: jest.fn().mockRejectedValue({ code: 'ER_ROW_IS_REFERENCED_2' }),
    };
    const service = new UsersService(repository as unknown as UsersRepository);

    await expect(service.delete(1)).rejects.toThrow(ConflictException);
  });
});
