/**
 * Настройки observability для SQL-запросов.
 */
export type SqlObservabilityConfig = {
  slowQueryThresholdMs: number;
};

/**
 * Читает настройки SQL observability из env.
 */
export function parseSqlObservabilityConfig(): SqlObservabilityConfig {
  const slowQueryThresholdMs = Number(
    process.env.SQL_SLOW_QUERY_THRESHOLD_MS ?? 100,
  );

  return {
    slowQueryThresholdMs:
      Number.isFinite(slowQueryThresholdMs) && slowQueryThresholdMs >= 0
        ? slowQueryThresholdMs
        : 100,
  };
}
