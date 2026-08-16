import { Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { TransactionsLabService } from '../services/transactions-lab.service';

/**
 * HTTP API учебных сценариев конкурентного доступа к MySQL/InnoDB.
 *
 * Цель: дать безопасную точку запуска сценариев с двумя отдельными соединениями.
 * Возможные ошибки: ошибки подключения, SQL и управления транзакциями передаются
 * в глобальный API exception filter.
 */
@ApiTags('transactions-lab')
@Controller('transactions-lab')
export class TransactionsLabController {
  constructor(
    private readonly transactionsLabService: TransactionsLabService,
  ) {}

  @Post('non-repeatable-read')
  @ApiOperation({
    summary:
      'Воспроизвести non-repeatable read на READ COMMITTED и REPEATABLE READ',
  })
  /**
   * Запускает сравнение non-repeatable read на двух уровнях изоляции.
   *
   * @returns Сценарий с первым и повторным чтением для каждого уровня.
   * @throws Ошибку MySQL, если сценарий не удалось подготовить или выполнить.
   */
  demonstrateNonRepeatableRead() {
    return this.transactionsLabService.demonstrateNonRepeatableRead();
  }

  @Post('phantom-read')
  @ApiOperation({
    summary: 'Воспроизвести phantom read на READ COMMITTED и REPEATABLE READ',
  })
  /**
   * Запускает сравнение phantom read на двух уровнях изоляции.
   *
   * @returns Сценарий с количеством строк до и после конкурентной вставки.
   * @throws Ошибку MySQL, если транзакцию или SQL-запрос выполнить не удалось.
   */
  demonstratePhantomRead() {
    return this.transactionsLabService.demonstratePhantomRead();
  }

  @Post('deadlock')
  @ApiOperation({
    summary: 'Воспроизвести deadlock на двух параллельных транзакциях',
  })
  /**
   * Запускает две транзакции с противоположным порядком блокировки строк.
   *
   * @returns Результат commit/rollback каждой ветки и код ошибки deadlock.
   * @throws Ошибку MySQL, если сценарий завершился вне ожидаемых веток.
   */
  simulateDeadlock() {
    return this.transactionsLabService.simulateDeadlock();
  }
}
