import { RowDataPacket } from 'mysql2';

/**
 * Raw row ranking-отчета пользователей.
 */
export type ReportUserRankingRow = RowDataPacket & {
  row_num: number;
  revenue_rank: number;
  user_id: number;
  email: string;
  name: string;
  orders_count: number;
  total_amount_sum: string;
  running_revenue: string;
};
