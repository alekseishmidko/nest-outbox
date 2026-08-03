/**
 * Результат health-check endpoint.
 */
export type HealthCheckResult = {
  status: 'ok';
  database: 'ok';
  timestamp: string;
};
