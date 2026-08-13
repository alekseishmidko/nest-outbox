import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MapsService } from '../../maps/services/maps.service';
import { UsersService } from '../../users/services/users.service';
import { CreateOrderDto } from '../dto/create-order.dto';
import { ListOrdersQueryDto } from '../dto/list-orders-query.dto';
import { UpdateOrderStatusDto } from '../dto/update-order-status.dto';
import { OrdersRepository } from '../repositories/orders.repository';
import {
  IdempotencyKeyConflictError,
  IdempotencyKeyInProgressError,
} from '../types/idempotency-error.type';
import { OrderOverviewRecord } from '../types/order-overview-record.type';
import { OrderRecord } from '../types/order-record.type';
import { OptimisticLockConflictError } from '../types/optimistic-lock-conflict.error';

/**
 * Сервис заказов.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly usersService: UsersService,
    private readonly mapsService: MapsService,
  ) {}

  /**
   * Создает заказ только для существующих пользователя и карты.
   *
   * Предварительная проверка делает ошибку API понятной и не пропускает наружу
   * MySQL foreign key exception.
   */
  async create(
    dto: CreateOrderDto,
    idempotencyKey?: string,
  ): Promise<OrderRecord> {
    const normalizedIdempotencyKey =
      this.normalizeIdempotencyKey(idempotencyKey);

    await this.usersService.findById(dto.userId);
    await this.mapsService.findById(dto.mapId);

    try {
      return await this.ordersRepository.createWithOutbox(
        dto,
        normalizedIdempotencyKey,
      );
    } catch (error) {
      if (error instanceof IdempotencyKeyConflictError) {
        throw new ConflictException(error.message);
      }

      if (error instanceof IdempotencyKeyInProgressError) {
        throw new ConflictException(error.message);
      }

      throw error;
    }
  }

  findAll(query: ListOrdersQueryDto): Promise<OrderRecord[]> {
    return this.ordersRepository.findAll(query);
  }

  /**
   * Возвращает отчет заказов с JOIN-данными пользователя и карты.
   */
  findOverview(query: ListOrdersQueryDto): Promise<OrderOverviewRecord[]> {
    return this.ordersRepository.findOverview(query);
  }

  async findById(id: number): Promise<OrderRecord> {
    const order = await this.ordersRepository.findById(id);

    if (!order) {
      throw new NotFoundException(`Заказ ${id} не найден`);
    }

    return order;
  }

  findByUserId(
    userId: number,
    query: ListOrdersQueryDto,
  ): Promise<OrderRecord[]> {
    return this.ordersRepository.findByUserId(userId, query);
  }

  findByMapId(
    mapId: number,
    query: ListOrdersQueryDto,
  ): Promise<OrderRecord[]> {
    return this.ordersRepository.findByMapId(mapId, query);
  }

  async updateStatus(
    id: number,
    dto: UpdateOrderStatusDto,
  ): Promise<OrderRecord> {
    let order: OrderRecord | null;
    try {
      order = await this.ordersRepository.updateStatus(
        id,
        dto.status,
        dto.version,
      );
    } catch (error) {
      if (error instanceof OptimisticLockConflictError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }

    if (!order) {
      throw new NotFoundException(`Заказ ${id} не найден`);
    }

    return order;
  }

  /**
   * Нормализует HTTP header `Idempotency-Key`.
   */
  private normalizeIdempotencyKey(idempotencyKey?: string): string | undefined {
    const normalized = idempotencyKey?.trim();

    if (!normalized) {
      return undefined;
    }

    if (normalized.length > 255) {
      throw new BadRequestException(
        'Idempotency-Key не должен быть длиннее 255 символов',
      );
    }

    return normalized;
  }
}
