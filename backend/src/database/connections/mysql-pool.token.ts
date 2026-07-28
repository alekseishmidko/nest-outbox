/**
 * DI-токен MySQL connection pool.
 *
 * Используется repositories и инфраструктурными сервисами для выполнения raw SQL
 * через `mysql2`.
 */
export const MYSQL_POOL = Symbol('MYSQL_POOL');
