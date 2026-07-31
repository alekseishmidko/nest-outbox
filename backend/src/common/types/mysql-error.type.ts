/**
 * Минимальная форма ошибки MySQL, которая нужна сервисному слою.
 */
export type MysqlError = {
  code?: string;
  errno?: number;
  sqlMessage?: string;
};
