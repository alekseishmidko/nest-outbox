import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UpdateOrderStatusDto } from '../dto/update-order-status.dto';
import { OrdersRepository } from '../repositories/orders.repository';
import { OptimisticLockConflictError } from '../types/optimistic-lock-conflict.error';
import { OrderRecord } from '../types/order-record.type';

@Injectable()
export class UpdateOrderStatusHandler {
  constructor(private readonly ordersRepository: OrdersRepository) {}

  async execute(id: number, dto: UpdateOrderStatusDto): Promise<OrderRecord> {
    try {
      const order = await this.ordersRepository.updateStatus(
        id,
        dto.status,
        dto.version,
      );
      if (!order) throw new NotFoundException(`Заказ ${id} не найден`);
      return order;
    } catch (error) {
      if (error instanceof OptimisticLockConflictError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  async executePessimistic(
    id: number,
    status: UpdateOrderStatusDto['status'],
  ): Promise<OrderRecord> {
    const order = await this.ordersRepository.updateStatusPessimistic(
      id,
      status,
    );
    if (!order) throw new NotFoundException(`Заказ ${id} не найден`);
    return order;
  }
}
