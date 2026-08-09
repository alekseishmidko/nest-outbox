import { BadRequestException, Injectable } from '@nestjs/common';
import { ExplainReportQueryDto } from '../dto/explain-report-query.dto';
import { ReportOrdersPageQueryDto } from '../dto/report-orders-page-query.dto';
import { TopReportQueryDto } from '../dto/top-report-query.dto';
import { ReportsRepository } from '../repositories/reports.repository';
import { ExplainReportRecord } from '../types/explain-report-record.type';
import { ReportCursor } from '../types/report-cursor.type';
import { ReportOrderPage } from '../types/report-order-page.type';
import { ReportStatusSummaryRecord } from '../types/report-status-summary-record.type';
import { ReportUserRankingRecord } from '../types/report-user-ranking-record.type';

/**
 * Сервис аналитических отчетов.
 *
 * Держит HTTP-независимую логику нормализации query-параметров и делегирует
 * тяжелые SQL-запросы repository-слою.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly reportsRepository: ReportsRepository) {}

  /**
   * Возвращает агрегаты заказов по статусам.
   */
  findOrderStatusSummary(): Promise<ReportStatusSummaryRecord[]> {
    return this.reportsRepository.findOrderStatusSummary();
  }

  /**
   * Возвращает ranking пользователей по сумме заказов.
   */
  findUserRevenueRanking(
    query: TopReportQueryDto,
  ): Promise<ReportUserRankingRecord[]> {
    return this.reportsRepository.findUserRevenueRanking(query);
  }

  /**
   * Возвращает страницу заказов в offset или cursor режиме.
   */
  findOrdersPage(query: ReportOrdersPageQueryDto): Promise<ReportOrderPage> {
    return this.reportsRepository.findOrdersPage(
      query,
      this.decodeCursor(query.cursor),
    );
  }

  /**
   * Возвращает план выполнения учебного reports-запроса.
   */
  explainAnalyze(query: ExplainReportQueryDto): Promise<ExplainReportRecord[]> {
    return this.reportsRepository.explainAnalyze(
      query.query ?? 'orders_page',
      query.mode ?? 'after',
    );
  }

  /**
   * Декодирует cursor из base64url.
   */
  private decodeCursor(cursor?: string): ReportCursor | null {
    if (!cursor) {
      return null;
    }

    try {
      const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString());
      const createdAt = new Date(parsed.createdAt);
      const orderId = Number(parsed.orderId);

      if (!Number.isFinite(orderId) || Number.isNaN(createdAt.getTime())) {
        throw new Error('Invalid cursor payload');
      }

      return {
        createdAt,
        orderId,
      };
    } catch {
      throw new BadRequestException('Некорректный cursor');
    }
  }
}
