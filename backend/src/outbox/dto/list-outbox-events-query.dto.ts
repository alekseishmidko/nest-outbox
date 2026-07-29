import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { OutboxEventStatus } from './outbox-event-status.dto';

/**
 * DTO query-параметров списка Outbox-событий.
 */
export class ListOutboxEventsQueryDto {
  @ApiPropertyOptional({
    description: 'Фильтр по статусу Outbox-события.',
    enum: OutboxEventStatus,
  })
  @IsOptional()
  @IsEnum(OutboxEventStatus)
  status?: OutboxEventStatus;

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
}
