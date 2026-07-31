import { Injectable, NotFoundException } from '@nestjs/common';
import { MapsService } from '../../maps/services/maps.service';
import { UsersService } from '../../users/services/users.service';
import { CreateOrderDto } from '../dto/create-order.dto';
import { ListOrdersQueryDto } from '../dto/list-orders-query.dto';
import { UpdateOrderStatusDto } from '../dto/update-order-status.dto';
import { OrdersRepository } from '../repositories/orders.repository';
import { OrderRecord } from '../types/order-record.type';

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
  async create(dto: CreateOrderDto): Promise<OrderRecord> {
    await this.usersService.findById(dto.userId);
    await this.mapsService.findById(dto.mapId);

    return this.ordersRepository.createWithOutbox(dto);
  }

  findAll(query: ListOrdersQueryDto): Promise<OrderRecord[]> {
    return this.ordersRepository.findAll(query);
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
    const order = await this.ordersRepository.updateStatus(id, dto.status);

    if (!order) {
      throw new NotFoundException(`Заказ ${id} не найден`);
    }

    return order;
  }
}
