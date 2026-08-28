/** Поддерживаемые внешние зависимости с отдельными настройками timeout. */
export type ExternalService = 'storage' | 'email' | 'routing' | 'payment';

/**
 * Возвращает timeout зависимости.
 *
 * Для составных имен вроде storage.s3 используется первая часть. Поэтому один
 * policy покрывает несколько клиентов одного класса зависимости, сохраняя
 * возможность настроить их единым параметром. Если специальной переменной нет,
 * используется EXTERNAL_TIMEOUT_MS, затем безопасный default 2 секунды.
 */
export function getExternalTimeout(serviceName: string): number {
  const service = serviceName.split('.')[0] as ExternalService;
  const envKey: Record<ExternalService, string> = {
    storage: 'STORAGE_TIMEOUT_MS',
    email: 'EMAIL_TIMEOUT_MS',
    routing: 'ROUTING_TIMEOUT_MS',
    payment: 'PAYMENT_TIMEOUT_MS',
  };
  return Number(
    process.env[envKey[service] ?? 'EXTERNAL_TIMEOUT_MS'] ??
      process.env.EXTERNAL_TIMEOUT_MS ??
      2_000,
  );
}
