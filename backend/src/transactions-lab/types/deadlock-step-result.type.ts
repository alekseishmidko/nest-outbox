/**
 * Результат одной конкурирующей транзакции в deadlock-сценарии.
 */
export type DeadlockStepResult = {
  transactionName: 'transaction_a' | 'transaction_b';
  status: 'committed' | 'rolled_back';
  errorCode: string | null;
  errno: number | null;
  sqlState: string | null;
  message: string | null;
};
