import {
  BadRequestException,
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
import { UserActivityQueryDto } from '../dto/user-activity-query.dto';
import { UsersRepository } from '../repositories/users.repository';
import { UserActivityCursor } from '../types/user-activity-cursor.type';
import { UserActivityPage } from '../types/user-activity-page.type';
import { UserActivityQuery } from '../types/user-activity-query.type';
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

  /**
   * Возвращает сложный отчет пользователя с заказами, картами и media.
   */
  async findActivity(
    userId: number,
    dto: UserActivityQueryDto,
  ): Promise<UserActivityPage> {
    await this.findById(userId);

    return this.usersRepository.findActivity(
      userId,
      this.normalizeActivityQuery(dto),
    );
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

  /**
   * Нормализует HTTP query DTO в параметры repository-запроса.
   */
  private normalizeActivityQuery(dto: UserActivityQueryDto): UserActivityQuery {
    const pagination = dto.pagination ?? 'offset';

    return {
      pagination,
      limit: Number(dto.limit ?? 20),
      offset: Number(dto.offset ?? 0),
      cursor:
        pagination === 'cursor' ? this.decodeActivityCursor(dto.cursor) : null,
    };
  }

  /**
   * Декодирует cursor pagination token.
   */
  private decodeActivityCursor(cursor?: string): UserActivityCursor | null {
    if (!cursor) {
      return null;
    }

    try {
      const parsed = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      ) as unknown;

      if (!this.isActivityCursorPayload(parsed)) {
        throw new Error('Invalid cursor payload');
      }

      return {
        createdAt: new Date(parsed.createdAt),
        orderId: parsed.orderId,
      };
    } catch {
      throw new BadRequestException({
        errorCode: 'INVALID_CURSOR',
        message: 'Некорректный cursor для пагинации',
      });
    }
  }

  /**
   * Проверяет payload cursor перед использованием в SQL.
   */
  private isActivityCursorPayload(
    value: unknown,
  ): value is { createdAt: string; orderId: number } {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const candidate = value as Partial<{ createdAt: string; orderId: number }>;

    return (
      typeof candidate.createdAt === 'string' &&
      !Number.isNaN(new Date(candidate.createdAt).getTime()) &&
      typeof candidate.orderId === 'number'
    );
  }
}
