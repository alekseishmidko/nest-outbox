/**
 * Результат health-check endpoint.
 */
export type HealthCheckResult = {
  status: 'ok' | 'error';
  database: 'ok';
  storage?: 'ok' | 'error';
  worker?: 'ok' | 'error';
  timestamp: string;
};
