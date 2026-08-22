import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserActivityQueryDto } from '../dto/user-activity-query.dto';
import { UsersRepository } from '../repositories/users.repository';
import { UserActivityCursor } from '../types/user-activity-cursor.type';
import { UserActivityPage } from '../types/user-activity-page.type';

@Injectable()
export class UserActivityQueryHandler {
  constructor(private readonly usersRepository: UsersRepository) {}

  async execute(
    userId: number,
    dto: UserActivityQueryDto,
  ): Promise<UserActivityPage> {
    if (!(await this.usersRepository.findById(userId))) {
      throw new NotFoundException(`Пользователь ${userId} не найден`);
    }

    const pagination = dto.pagination ?? 'offset';
    return this.usersRepository.findActivity(userId, {
      pagination,
      limit: Number(dto.limit ?? 20),
      offset: Number(dto.offset ?? 0),
      cursor: pagination === 'cursor' ? this.decodeCursor(dto.cursor) : null,
    });
  }

  private decodeCursor(cursor?: string): UserActivityCursor | null {
    if (!cursor) return null;
    try {
      const parsed = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      ) as {
        createdAt?: string;
        orderId?: number;
      };
      if (
        typeof parsed.createdAt !== 'string' ||
        Number.isNaN(new Date(parsed.createdAt).getTime()) ||
        typeof parsed.orderId !== 'number'
      )
        throw new Error('Invalid cursor');
      return { createdAt: new Date(parsed.createdAt), orderId: parsed.orderId };
    } catch {
      throw new BadRequestException({
        errorCode: 'INVALID_CURSOR',
        message: 'Некорректный cursor для пагинации',
      });
    }
  }
}
