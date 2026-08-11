import { IsolationLevel } from './isolation-level.type';

/**
 * Результат одного сценария чтения на конкретном уровне изоляции.
 */
export type IsolationScenarioResult = {
  isolationLevel: IsolationLevel;
  firstRead: number;
  secondRead: number;
  anomalyDetected: boolean;
};
