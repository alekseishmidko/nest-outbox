import { DeadlockStepResult } from './deadlock-step-result.type';

/**
 * Результат воспроизведения deadlock на двух параллельных транзакциях.
 */
export type DeadlockSimulationResult = {
  scenario: 'deadlock_simulation';
  description: string;
  deadlockDetected: boolean;
  results: DeadlockStepResult[];
  conclusion: string;
};
