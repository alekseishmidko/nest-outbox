import { Injectable, NotFoundException } from '@nestjs/common';
import { ListOrdersQueryDto } from '../dto/list-orders-query.dto';
import { OrdersRepository } from '../repositories/orders.repository';
import { OrderOverviewRecord } from '../types/order-overview-record.type';
import { OrderRecord } from '../types/order-record.type';

@Injectable()
export class ListOrdersQueryHandler {
  constructor(private readonly ordersRepository: OrdersRepository) {}

  execute(query: ListOrdersQueryDto): Promise<OrderRecord[]> {
    return this.ordersRepository.findAll(query);
  }

  byUser(userId: number, query: ListOrdersQueryDto): Promise<OrderRecord[]> {
    return this.ordersRepository.findByUserId(userId, query);
  }

  byMap(mapId: number, query: ListOrdersQueryDto): Promise<OrderRecord[]> {
    return this.ordersRepository.findByMapId(mapId, query);
  }

  async byId(id: number): Promise<OrderRecord> {
    const order = await this.ordersRepository.findById(id);
    if (!order) throw new NotFoundException(`Заказ ${id} не найден`);
    return order;
  }
}

@Injectable()
export class OrderOverviewQueryHandler {
  constructor(private readonly ordersRepository: OrdersRepository) {}

  execute(query: ListOrdersQueryDto): Promise<OrderOverviewRecord[]> {
    return this.ordersRepository.findOverview(query);
  }
}
