import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { OrderStatus } from './order-status.dto';

/** DTO изменения статуса с pessimistic locking. */
export class UpdateOrderStatusPessimisticDto {
  @ApiProperty({
    description: 'Новый статус заказа.',
    enum: OrderStatus,
    example: OrderStatus.Paid,
  })
  @IsEnum(OrderStatus)
  status!: OrderStatus;
}
