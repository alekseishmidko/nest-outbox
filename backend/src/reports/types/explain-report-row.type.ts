import { RowDataPacket } from 'mysql2';

/**
 * Raw row результата `EXPLAIN ANALYZE` в MySQL.
 */
export type ExplainReportRow = RowDataPacket & {
  EXPLAIN: string;
};
