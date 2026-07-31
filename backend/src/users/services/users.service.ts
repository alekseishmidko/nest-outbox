import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  isMysqlDuplicateEntryError,
  isMysqlForeignKeyReferencedError,
} from '../../common/utils/mysql-error.util';
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

  async create(dto: CreateUserDto): Promise<UserRecord> {
    try {
      return await this.usersRepository.create(dto);
    } catch (error) {
      if (isMysqlDuplicateEntryError(error)) {
        throw new ConflictException(`Email ${dto.email} уже используется`);
      }

      throw error;
    }
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
    let deleted: boolean;

    try {
      deleted = await this.usersRepository.delete(id);
    } catch (error) {
      if (isMysqlForeignKeyReferencedError(error)) {
        throw new ConflictException(
          `Пользователь ${id} связан с картами или заказами и не может быть удален`,
        );
      }

      throw error;
    }

    if (!deleted) {
      throw new NotFoundException(`Пользователь ${id} не найден`);
    }

    return { deleted: true };
  }
}
