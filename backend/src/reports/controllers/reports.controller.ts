import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ExplainReportQueryDto } from '../dto/explain-report-query.dto';
import { ReportOrdersPageQueryDto } from '../dto/report-orders-page-query.dto';
import { TopReportQueryDto } from '../dto/top-report-query.dto';
import { ReportsService } from '../services/reports.service';

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('orders/status-summary')
  @ApiOperation({
    summary: 'Получить GROUP BY статистику заказов по статусам',
  })
  findOrderStatusSummary() {
    return this.reportsService.findOrderStatusSummary();
  }

  @Get('users/revenue-ranking')
  @ApiOperation({
    summary:
      'Получить ranking пользователей через ROW_NUMBER, RANK и SUM() OVER',
  })
  findUserRevenueRanking(@Query() query: TopReportQueryDto) {
    return this.reportsService.findUserRevenueRanking(query);
  }

  @Get('orders/page')
  @ApiOperation({
    summary: 'Получить страницу заказов для сравнения offset/cursor pagination',
  })
  findOrdersPage(@Query() query: ReportOrdersPageQueryDto) {
    return this.reportsService.findOrdersPage(query);
  }

  @Get('explain')
  @ApiOperation({
    summary: 'Получить EXPLAIN ANALYZE для reports-запросов до/после индексов',
  })
  explainAnalyze(@Query() query: ExplainReportQueryDto) {
    return this.reportsService.explainAnalyze(query);
  }
}
