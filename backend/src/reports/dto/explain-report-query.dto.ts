import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

/**
 * DTO query-параметров для `EXPLAIN ANALYZE` reports-запросов.
 */
export class ExplainReportQueryDto {
  @ApiPropertyOptional({
    description: 'Какой SQL-план нужно снять.',
    enum: ['orders_page', 'status_summary', 'user_ranking'],
    default: 'orders_page',
  })
  @IsOptional()
  @IsIn(['orders_page', 'status_summary', 'user_ranking'])
  query?: 'orders_page' | 'status_summary' | 'user_ranking' = 'orders_page';

  @ApiPropertyOptional({
    description:
      'Режим плана: before имитирует отсутствие новых индексов через IGNORE INDEX, after использует оптимизированный план.',
    enum: ['before', 'after'],
    default: 'after',
  })
  @IsOptional()
  @IsIn(['before', 'after'])
  mode?: 'before' | 'after' = 'after';
}
