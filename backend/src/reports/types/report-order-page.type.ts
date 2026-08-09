import { ReportOrderRecord } from './report-order-record.type';

/**
 * Страница отчета заказов.
 */
export type ReportOrderPage = {
  items: ReportOrderRecord[];
  pageInfo: {
    pagination: 'offset' | 'cursor';
    limit: number;
    hasMore: boolean;
    offset?: number;
    nextOffset?: number;
    nextCursor?: string;
  };
};
