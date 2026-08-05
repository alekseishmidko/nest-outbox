import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * DTO query-параметров отчета активности пользователя.
 */
export class UserActivityQueryDto {
  @ApiPropertyOptional({
    description: 'Режим пагинации.',
    enum: ['offset', 'cursor'],
    default: 'offset',
  })
  @IsOptional()
  @IsIn(['offset', 'cursor'])
  pagination?: 'offset' | 'cursor' = 'offset';

  @ApiPropertyOptional({
    description: 'Количество записей на странице.',
    example: 20,
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

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
