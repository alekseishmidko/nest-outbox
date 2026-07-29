import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateUserDto } from '../dto/create-user.dto';
import { ListUsersQueryDto } from '../dto/list-users-query.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UsersRepository } from '../repositories/users.repository';
import { UserRecord } from '../types/user-record.type';

/**
 * Сервис пользователей.
 *
 * Содержит бизнес-логику работы с пользователями без SQL-запросов.
 */
@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  create(dto: CreateUserDto): Promise<UserRecord> {
    return this.usersRepository.create(dto);
  }

  findAll(query: ListUsersQueryDto): Promise<UserRecord[]> {
    return this.usersRepository.findAll(query);
  }

  async findById(id: number): Promise<UserRecord> {
    const user = await this.usersRepository.findById(id);

    if (!user) {
      throw new NotFoundException(`Пользователь ${id} не найден`);
    }

    return user;
  }

  async update(id: number, dto: UpdateUserDto): Promise<UserRecord> {
    const user = await this.usersRepository.update(id, dto);

    if (!user) {
      throw new NotFoundException(`Пользователь ${id} не найден`);
    }

    return user;
  }

  async delete(id: number): Promise<{ deleted: true }> {
    const deleted = await this.usersRepository.delete(id);

    if (!deleted) {
      throw new NotFoundException(`Пользователь ${id} не найден`);
    }

    return { deleted: true };
  }
}
