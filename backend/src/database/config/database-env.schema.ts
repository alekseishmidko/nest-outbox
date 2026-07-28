import { z } from 'zod';

/**
 * Схема env-переменных для подключения к MySQL.
 *
 * Значения валидируются до создания connection pool, чтобы приложение падало
 * на старте с понятной ошибкой конфигурации.
 */
export const databaseEnvSchema = z.object({
  MYSQL_HOST: z.string().min(1).default('localhost'),
  MYSQL_PORT: z.coerce.number().int().positive().default(3306),
  MYSQL_DATABASE: z.string().min(1).default('nest_outbox'),
  MYSQL_USER: z.string().min(1).default('app'),
  MYSQL_PASSWORD: z.string().min(1).default('app_password'),
  MYSQL_CONNECTION_LIMIT: z.coerce.number().int().positive().default(10),
});

export type DatabaseEnv = z.infer<typeof databaseEnvSchema>;

/**
 * Возвращает валидированную конфигурацию MySQL из `process.env`.
 */
export function parseDatabaseEnv(): DatabaseEnv {
  return databaseEnvSchema.parse(process.env);
}
