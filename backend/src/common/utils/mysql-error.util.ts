import { MysqlError } from '../types/mysql-error.type';

/**
 * Проверяет, что ошибка похожа на ошибку MySQL.
 */
export function isMysqlError(error: unknown): error is MysqlError {
  return typeof error === 'object' && error !== null;
}

/**
 * Проверяет нарушение foreign key из-за существующих дочерних записей.
 */
export function isMysqlForeignKeyReferencedError(error: unknown): boolean {
  return (
    isMysqlError(error) &&
    (error.code === 'ER_ROW_IS_REFERENCED_2' || error.errno === 1451)
  );
}

/**
 * Проверяет нарушение unique constraint.
 */
export function isMysqlDuplicateEntryError(error: unknown): boolean {
  return (
    isMysqlError(error) &&
    (error.code === 'ER_DUP_ENTRY' || error.errno === 1062)
  );
}

/**
 * Проверяет deadlock, при котором InnoDB откатывает одну из транзакций.
 */
export function isMysqlDeadlockError(error: unknown): boolean {
  return (
    isMysqlError(error) &&
    (error.code === 'ER_LOCK_DEADLOCK' || error.errno === 1213)
  );
}
