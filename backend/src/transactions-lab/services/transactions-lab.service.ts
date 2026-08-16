import { Injectable } from '@nestjs/common';
import { TransactionsLabRepository } from '../repositories/transactions-lab.repository';
import { DeadlockSimulationResult } from '../types/deadlock-simulation-result.type';
import { IsolationComparisonResult } from '../types/isolation-comparison-result.type';

/**
 * Сервис учебных транзакционных сценариев.
 *
 * Цель: сформировать понятный доменный ответ поверх SQL-демонстраций.
 * Возможные ошибки: методы передают ошибки repository без маскирования.
 */
@Injectable()
export class TransactionsLabService {
  constructor(
    private readonly transactionsLabRepository: TransactionsLabRepository,
  ) {}

  /**
   * Демонстрирует non-repeatable read на двух уровнях изоляции.
   *
   * @returns Сравнение результатов `READ COMMITTED` и `REPEATABLE READ`.
   * @throws Ошибку MySQL при сбое подготовки, чтения или commit/rollback.
   */
  async demonstrateNonRepeatableRead(): Promise<IsolationComparisonResult> {
    const results =
      await this.transactionsLabRepository.compareNonRepeatableRead();

    return {
      scenario: 'non_repeatable_read',
      description:
        'Одна транзакция дважды читает одну строку, а другая транзакция меняет ее между чтениями.',
      results,
      conclusion:
        'READ COMMITTED видит новое committed значение, REPEATABLE READ продолжает читать старый snapshot.',
    };
  }

  /**
   * Демонстрирует phantom read на двух уровнях изоляции.
   *
   * @returns Сравнение количества строк до и после конкурентной вставки.
   * @throws Ошибку MySQL при сбое подготовки, чтения или commit/rollback.
   */
  async demonstratePhantomRead(): Promise<IsolationComparisonResult> {
    const results = await this.transactionsLabRepository.comparePhantomRead();

    return {
      scenario: 'phantom_read',
      description:
        'Одна транзакция дважды выполняет predicate query, а другая вставляет подходящую строку между чтениями.',
      results,
      conclusion:
        'READ COMMITTED видит новую committed строку, REPEATABLE READ продолжает читать старый snapshot.',
    };
  }

  /**
   * Демонстрирует deadlock на двух транзакциях.
   *
   * @returns Итог обеих транзакций и признак `ER_LOCK_DEADLOCK`.
   * @throws Ошибку MySQL, если deadlock-сценарий не удалось запустить.
   */
  async simulateDeadlock(): Promise<DeadlockSimulationResult> {
    const results = await this.transactionsLabRepository.simulateDeadlock();
    const deadlockDetected = results.some(
      (result) => result.errorCode === 'ER_LOCK_DEADLOCK',
    );

    return {
      scenario: 'deadlock_simulation',
      description:
        'Две транзакции обновляют две строки в противоположном порядке, из-за чего InnoDB откатывает одну из них.',
      deadlockDetected,
      results,
      conclusion: deadlockDetected
        ? 'Deadlock воспроизведен: одна транзакция закоммитилась, другая была откатана InnoDB.'
        : 'Deadlock не был зафиксирован в этом запуске; сценарий стоит повторить или проверить настройки InnoDB.',
    };
  }
}
