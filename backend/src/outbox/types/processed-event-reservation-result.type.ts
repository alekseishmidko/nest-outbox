/**
 * Результат reservation для идемпотентной обработки Outbox-события.
 */
export enum ProcessedEventReservationResult {
  Reserved = 'reserved',
  AlreadyProcessing = 'already_processing',
  AlreadyProcessed = 'already_processed',
}
