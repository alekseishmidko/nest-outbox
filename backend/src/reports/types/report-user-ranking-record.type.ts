/**
 * Строка ranking-отчета пользователей.
 */
export type ReportUserRankingRecord = {
  rowNumber: number;
  revenueRank: number;
  userId: number;
  email: string;
  name: string;
  ordersCount: number;
  totalAmountSum: string;
  runningRevenue: string;
};
