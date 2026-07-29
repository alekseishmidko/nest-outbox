import { RowDataPacket } from 'mysql2';

/**
 * SQL-row таблицы `users` в snake_case формате MySQL.
 */
export type UserRow = RowDataPacket & {
  id: number;
  email: string;
  name: string;
  avatar_seed: string;
  created_at: Date;
  updated_at: Date;
};
