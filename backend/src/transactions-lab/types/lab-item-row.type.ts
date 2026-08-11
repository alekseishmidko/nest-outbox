import { RowDataPacket } from 'mysql2';

/**
 * SQL-row учебной таблицы transaction lab.
 */
export type LabItemRow = RowDataPacket & {
  value: number;
};
