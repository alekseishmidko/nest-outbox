import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, Min } from 'class-validator';

/**
 * DTO создания заказа.
 */
export class CreateOrderDto {
  @ApiProperty({
    description: 'ID пользователя, который создает заказ.',
    example: 1,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId!: number;

  @ApiProperty({
    description: 'ID карты, связанной с заказом.',
    example: 1,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  mapId!: number;

  @ApiProperty({
    description: 'Сумма заказа.',
    example: 199.9,
    minimum: 0,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalAmount!: number;
}
