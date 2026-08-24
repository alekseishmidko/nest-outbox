import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { MYSQL_POOL } from '../../database/connections/mysql-pool.token';
import { ReportOrdersPageQueryDto } from '../dto/report-orders-page-query.dto';
import { TopReportQueryDto } from '../dto/top-report-query.dto';
import { ExplainReportRecord } from '../types/explain-report-record.type';
import { ExplainReportRow } from '../types/explain-report-row.type';
import { ReportCursor } from '../types/report-cursor.type';
import { ReportOrderPage } from '../types/report-order-page.type';
import { ReportOrderRecord } from '../types/report-order-record.type';
import { ReportOrderRow } from '../types/report-order-row.type';
import { ReportStatusSummaryRecord } from '../types/report-status-summary-record.type';
import { ReportStatusSummaryRow } from '../types/report-status-summary-row.type';
import { ReportUserRankingRecord } from '../types/report-user-ranking-record.type';
import { ReportUserRankingRow } from '../types/report-user-ranking-row.type';
import { SqlValue } from '../types/sql-value.type';
import { createReportOrdersQueryObject } from '../../common/sql/query-objects/report-orders.query-object';

/**
 * Repository аналитических отчетов.
 *
 * Содержит намеренно более тяжелые SQL-запросы для тренировки `GROUP BY`,
 * window functions, пагинации и анализа `EXPLAIN ANALYZE`.
 */
@Injectable()
export class ReportsRepository {
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  /**
   * Возвращает статистику заказов по статусам через `GROUP BY`.
   */
  async findOrderStatusSummary(): Promise<ReportStatusSummaryRecord[]> {
    const [rows] = await this.pool.query<ReportStatusSummaryRow[]>(
      `
        SELECT
          status,
          COUNT(*) AS orders_count,
          COALESCE(SUM(total_amount), 0) AS total_amount_sum,
          AVG(total_amount) AS average_order_amount,
          MIN(total_amount) AS min_order_amount,
          MAX(total_amount) AS max_order_amount
        FROM orders
        GROUP BY status
        ORDER BY orders_count DESC, status ASC
      `,
    );

    return rows.map(this.toStatusSummaryRecord);
  }

  /**
   * Возвращает ranking пользователей по выручке.
   *
   * `ROW_NUMBER` дает стабильный порядковый номер строки, `RANK` показывает
   * место с учетом одинаковой суммы, `SUM() OVER` считает накопительную сумму.
   */
  async findUserRevenueRanking(
    query: TopReportQueryDto,
  ): Promise<ReportUserRankingRecord[]> {
    const limit = Number(query.limit ?? 20);
    const [rows] = await this.pool.query<ReportUserRankingRow[]>(
      `
        WITH user_order_stats AS (
          SELECT
            u.id AS user_id,
            u.email,
            u.name,
            COUNT(o.id) AS orders_count,
            COALESCE(SUM(o.total_amount), 0) AS total_amount_sum
          FROM users AS u
          LEFT JOIN orders AS o ON o.user_id = u.id
          GROUP BY
            u.id,
            u.email,
            u.name
        )
        SELECT
          ROW_NUMBER() OVER (
            ORDER BY total_amount_sum DESC, user_id ASC
          ) AS row_num,
          RANK() OVER (
            ORDER BY total_amount_sum DESC
          ) AS revenue_rank,
          user_id,
          email,
          name,
          orders_count,
          total_amount_sum,
          SUM(total_amount_sum) OVER (
            ORDER BY total_amount_sum DESC, user_id ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS running_revenue
        FROM user_order_stats
        ORDER BY total_amount_sum DESC, user_id ASC
        LIMIT ?
      `,
      [limit],
    );

    return rows.map(this.toUserRankingRecord);
  }

  /**
   * Возвращает страницу заказов для сравнения offset и cursor pagination.
   */
  async findOrdersPage(
    query: ReportOrdersPageQueryDto,
    cursor: ReportCursor | null,
  ): Promise<ReportOrderPage> {
    const pagination = query.pagination ?? 'offset';
    const limit = Number(query.limit ?? 50);
    const offset = Number(query.offset ?? 0);
    const queryObject = createReportOrdersQueryObject(query, cursor);
    const values: SqlValue[] = [...queryObject.params];

    values.push(limit + 1);

    if (pagination === 'offset') {
      values.push(offset);
    }

    const [rows] = await this.pool.query<ReportOrderRow[]>(
      `
        SELECT
          o.id AS order_id,
          o.status,
          o.total_amount,
          o.created_at,
          u.id AS user_id,
          u.email AS user_email,
          m.id AS map_id,
          m.title AS map_title
        FROM orders AS o FORCE INDEX (idx_reports_orders_created_id)
        JOIN users AS u ON u.id = o.user_id
        JOIN maps AS m ON m.id = o.map_id
        ${queryObject.where}
        ORDER BY o.created_at DESC, o.id DESC
        LIMIT ?
        ${pagination === 'offset' ? 'OFFSET ?' : ''}
      `,
      values,
    );
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(this.toOrderRecord);

    return {
      items,
      pageInfo: this.toPageInfo(pagination, limit, offset, items, hasMore),
    };
  }

  /**
   * Возвращает `EXPLAIN ANALYZE` для reports-запроса.
   */
  async explainAnalyze(
    queryName: 'orders_page' | 'status_summary' | 'user_ranking',
    mode: 'before' | 'after',
  ): Promise<ExplainReportRecord[]> {
    const [rows] = await this.pool.query<ExplainReportRow[]>(
      this.createExplainSql(queryName, mode),
    );

    return rows.map((row) => ({ line: row.EXPLAIN }));
  }

  /**
   * Формирует SQL для `EXPLAIN ANALYZE`.
   */
  private createExplainSql(
    queryName: 'orders_page' | 'status_summary' | 'user_ranking',
    mode: 'before' | 'after',
  ): string {
    if (queryName === 'status_summary') {
      return `
        EXPLAIN ANALYZE
        SELECT
          status,
          COUNT(*) AS orders_count,
          COALESCE(SUM(total_amount), 0) AS total_amount_sum,
          AVG(total_amount) AS average_order_amount
        FROM orders
          ${mode === 'before' ? 'IGNORE INDEX (idx_reports_orders_status_created_covering)' : ''}
        GROUP BY status
        ORDER BY orders_count DESC, status ASC
      `;
    }

    if (queryName === 'user_ranking') {
      return `
        EXPLAIN ANALYZE
        WITH user_order_stats AS (
          SELECT
            u.id AS user_id,
            u.email,
            u.name,
            COUNT(o.id) AS orders_count,
            COALESCE(SUM(o.total_amount), 0) AS total_amount_sum
          FROM users AS u
          LEFT JOIN orders AS o
            ${mode === 'before' ? 'IGNORE INDEX (idx_reports_orders_user_amount)' : ''}
            ON o.user_id = u.id
          GROUP BY
            u.id,
            u.email,
            u.name
        )
        SELECT
          ROW_NUMBER() OVER (ORDER BY total_amount_sum DESC, user_id ASC) AS row_num,
          RANK() OVER (ORDER BY total_amount_sum DESC) AS revenue_rank,
          user_id,
          email,
          name,
          orders_count,
          total_amount_sum,
          SUM(total_amount_sum) OVER (
            ORDER BY total_amount_sum DESC, user_id ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS running_revenue
        FROM user_order_stats
        ORDER BY total_amount_sum DESC, user_id ASC
        LIMIT 50
      `;
    }

    return `
      EXPLAIN ANALYZE
      SELECT
        o.id AS order_id,
        o.status,
        o.total_amount,
        o.created_at,
        u.id AS user_id,
        u.email AS user_email,
        m.id AS map_id,
        m.title AS map_title
      FROM orders AS o
        ${
          mode === 'before'
            ? 'IGNORE INDEX (idx_reports_orders_created_id, idx_reports_orders_status_created_covering)'
            : 'FORCE INDEX (idx_reports_orders_created_id)'
        }
      JOIN users AS u ON u.id = o.user_id
      JOIN maps AS m ON m.id = o.map_id
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT 50 OFFSET 500
    `;
  }

  /**
   * Формирует metadata страницы.
   */
  private toPageInfo(
    pagination: 'offset' | 'cursor',
    limit: number,
    offset: number,
    items: ReportOrderRecord[],
    hasMore: boolean,
  ): ReportOrderPage['pageInfo'] {
    if (pagination === 'offset') {
      const pageInfo: ReportOrderPage['pageInfo'] = {
        pagination,
        limit,
        offset,
        hasMore,
      };

      if (hasMore) {
        pageInfo.nextOffset = offset + limit;
      }

      return pageInfo;
    }

    const lastItem = items.at(-1);
    const pageInfo: ReportOrderPage['pageInfo'] = {
      pagination,
      limit,
      hasMore,
    };

    if (hasMore && lastItem) {
      pageInfo.nextCursor = this.encodeCursor(
        lastItem.createdAt,
        lastItem.orderId,
      );
    }

    return pageInfo;
  }

  /**
   * Кодирует cursor в base64url.
   */
  private encodeCursor(createdAt: Date, orderId: number): string {
    return Buffer.from(
      JSON.stringify({
        createdAt: createdAt.toISOString(),
        orderId,
      }),
      'utf8',
    ).toString('base64url');
  }

  /**
   * Преобразует строку статуса в API record.
   */
  private toStatusSummaryRecord(
    row: ReportStatusSummaryRow,
  ): ReportStatusSummaryRecord {
    return {
      status: row.status,
      ordersCount: row.orders_count,
      totalAmountSum: row.total_amount_sum,
      averageOrderAmount: row.average_order_amount,
      minOrderAmount: row.min_order_amount,
      maxOrderAmount: row.max_order_amount,
    };
  }

  /**
   * Преобразует строку ranking-отчета в API record.
   */
  private toUserRankingRecord(
    row: ReportUserRankingRow,
  ): ReportUserRankingRecord {
    return {
      rowNumber: row.row_num,
      revenueRank: row.revenue_rank,
      userId: row.user_id,
      email: row.email,
      name: row.name,
      ordersCount: row.orders_count,
      totalAmountSum: row.total_amount_sum,
      runningRevenue: row.running_revenue,
    };
  }

  /**
   * Преобразует строку отчета заказов в API record.
   */
  private toOrderRecord(row: ReportOrderRow): ReportOrderRecord {
    return {
      orderId: row.order_id,
      status: row.status,
      totalAmount: row.total_amount,
      createdAt: row.created_at,
      user: {
        id: row.user_id,
        email: row.user_email,
      },
      map: {
        id: row.map_id,
        title: row.map_title,
      },
    };
  }
}
