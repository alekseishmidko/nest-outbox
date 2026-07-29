import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { OrderStatus } from './order-status.dto';

/**
 * DTO изменения статуса заказа.
 */
export class UpdateOrderStatusDto {
  @ApiProperty({
    description: 'Новый статус заказа.',
    enum: OrderStatus,
    example: OrderStatus.Paid,
  })
  @IsEnum(OrderStatus)
  status!: OrderStatus;
}
