import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UpdateOrderStatusDto } from '../dto/update-order-status.dto';
import { OrdersRepository } from '../repositories/orders.repository';
import { OptimisticLockConflictError } from '../types/optimistic-lock-conflict.error';
import { OrderRecord } from '../types/order-record.type';
import { InvalidOrderStatusTransitionError } from '../types/invalid-order-status-transition.error';

@Injectable()
export class UpdateOrderStatusHandler {
  constructor(private readonly ordersRepository: OrdersRepository) {}

  async execute(
    id: number,
    dto: UpdateOrderStatusDto,
    actorUserId?: number,
  ): Promise<OrderRecord> {
    try {
      const order = await this.ordersRepository.updateStatus(
        id,
        dto.status,
        dto.version,
        actorUserId,
      );
      if (!order) throw new NotFoundException(`Заказ ${id} не найден`);
      return order;
    } catch (error) {
      if (error instanceof OptimisticLockConflictError) {
        throw new ConflictException(error.message);
      }
      if (error instanceof InvalidOrderStatusTransitionError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  async executePessimistic(
    id: number,
    status: UpdateOrderStatusDto['status'],
    actorUserId?: number,
  ): Promise<OrderRecord> {
    try {
      const order = await this.ordersRepository.updateStatusPessimistic(
        id,
        status,
        actorUserId,
      );
      if (!order) throw new NotFoundException(`Заказ ${id} не найден`);
      return order;
    } catch (error) {
      if (error instanceof InvalidOrderStatusTransitionError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
