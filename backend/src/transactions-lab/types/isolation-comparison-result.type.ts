import { IsolationScenarioResult } from './isolation-scenario-result.type';

/**
 * Сравнение одного сценария на `READ COMMITTED` и `REPEATABLE READ`.
 */
export type IsolationComparisonResult = {
  scenario: 'non_repeatable_read' | 'phantom_read';
  description: string;
  results: IsolationScenarioResult[];
  conclusion: string;
};
