import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { MapsService } from '../../maps/services/maps.service';
import { UsersService } from '../../users/services/users.service';
import { CreateOrderDto } from '../dto/create-order.dto';
import { OrdersRepository } from '../repositories/orders.repository';
import {
  IdempotencyKeyConflictError,
  IdempotencyKeyInProgressError,
} from '../types/idempotency-error.type';
import { OrderRecord } from '../types/order-record.type';

@Injectable()
export class CreateOrderHandler {
  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly usersService: UsersService,
    private readonly mapsService: MapsService,
  ) {}

  async execute(
    dto: CreateOrderDto,
    idempotencyKey?: string,
  ): Promise<OrderRecord> {
    const normalizedKey = this.normalizeIdempotencyKey(idempotencyKey);

    await this.usersService.findById(dto.userId);
    await this.mapsService.findById(dto.mapId);

    try {
      return await this.ordersRepository.createWithOutbox(dto, normalizedKey);
    } catch (error) {
      if (
        error instanceof IdempotencyKeyConflictError ||
        error instanceof IdempotencyKeyInProgressError
      ) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  private normalizeIdempotencyKey(value?: string): string | undefined {
    const normalized = value?.trim();
    if (!normalized) return undefined;
    if (normalized.length > 255) {
      throw new BadRequestException(
        'Idempotency-Key не должен быть длиннее 255 символов',
      );
    }
    return normalized;
  }
}
