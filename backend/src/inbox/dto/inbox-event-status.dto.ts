/** Статусы жизненного цикла входящего события. */
export enum InboxEventStatus {
  Received = 'received',
  Processing = 'processing',
  Processed = 'processed',
  Failed = 'failed',
  DeadLetter = 'dead_letter',
}
