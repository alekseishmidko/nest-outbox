/**
 * Результат health-check endpoint.
 */
export type HealthCheckResult = {
  status: 'ok' | 'error';
  database: 'ok';
  storage?: 'ok' | 'error';
  worker?: 'ok' | 'error';
  redis?: 'ok' | 'disabled' | 'error';
  timestamp: string;
};
