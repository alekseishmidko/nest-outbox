import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * DTO query-параметров отчета заказов с offset/cursor pagination.
 */
export class ReportOrdersPageQueryDto {
  @ApiPropertyOptional({
    description: 'Режим пагинации для сравнения offset и cursor.',
    enum: ['offset', 'cursor'],
    default: 'offset',
  })
  @IsOptional()
  @IsIn(['offset', 'cursor'])
  pagination?: 'offset' | 'cursor' = 'offset';

  @ApiPropertyOptional({
    description: 'Количество записей на странице.',
    example: 50,
    minimum: 1,
    maximum: 200,
    default: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @ApiPropertyOptional({
    description: 'Смещение для offset pagination.',
    example: 0,
    minimum: 0,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @ApiPropertyOptional({
    description: 'Cursor для cursor pagination.',
    example:
      'eyJjcmVhdGVkQXQiOiIyMDI2LTA4LTA1VDAwOjAwOjAwLjAwMFoiLCJvcmRlcklkIjoxMDB9',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}
