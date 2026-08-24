import { ReportOrdersPageQueryDto } from '../../../reports/dto/report-orders-page-query.dto';
import { ReportCursor } from '../../../reports/types/report-cursor.type';
import { dateRange } from '../specifications/filter-specifications';
import { and, Specification, SqlValue } from '../specifications/specification';

export function createReportOrdersQueryObject(
  query: ReportOrdersPageQueryDto,
  cursor: ReportCursor | null,
): { where: string; params: SqlValue[] } {
  const specifications: Specification[] = [];
  if (query.createdFrom || query.createdTo) {
    specifications.push(
      dateRange(
        {
          from: query.createdFrom ? new Date(query.createdFrom) : null,
          to: query.createdTo ? new Date(query.createdTo) : null,
        },
        'o.created_at',
      ),
    );
  }
  if (query.pagination === 'cursor' && cursor) {
    specifications.push({
      toSql: () => ({
        sql: '(o.created_at < ? OR (o.created_at = ? AND o.id < ?))',
        params: [cursor.createdAt, cursor.createdAt, cursor.orderId],
      }),
    });
  }
  const fragment = and(...specifications).toSql();
  return {
    where: fragment.sql === '1 = 1' ? '' : `WHERE ${fragment.sql}`,
    params: fragment.params,
  };
}
