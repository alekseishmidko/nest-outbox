import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Контекст observability для одного HTTP-запроса или фоновой операции.
 */
export type ObservabilityContext = {
  requestId?: string;
  correlationId?: string;
};

const storage = new AsyncLocalStorage<ObservabilityContext>();

/**
 * Выполняет callback внутри observability context.
 */
export function runWithObservabilityContext<T>(
  context: ObservabilityContext,
  callback: () => T,
): T {
  return storage.run(context, callback);
}

/**
 * Возвращает текущий observability context.
 */
export function getObservabilityContext(): ObservabilityContext {
  return storage.getStore() ?? {};
}
