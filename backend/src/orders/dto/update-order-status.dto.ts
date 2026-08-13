import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, Min } from 'class-validator';
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

  @ApiProperty({
    description: 'Текущая версия заказа для optimistic locking.',
    example: 0,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  version!: number;
}
