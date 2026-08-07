/**
 * Ошибка повторного использования Idempotency-Key с другим телом запроса.
 */
export class IdempotencyKeyConflictError extends Error {
  constructor() {
    super('Idempotency-Key уже использован с другим телом запроса');
  }
}

/**
 * Ошибка повторного запроса, когда исходная операция еще не завершена.
 */
export class IdempotencyKeyInProgressError extends Error {
  constructor() {
    super('Запрос с таким Idempotency-Key уже обрабатывается');
  }
}
