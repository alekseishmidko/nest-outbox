import { Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { TransactionsLabService } from '../services/transactions-lab.service';

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
  demonstrateNonRepeatableRead() {
    return this.transactionsLabService.demonstrateNonRepeatableRead();
  }

  @Post('phantom-read')
  @ApiOperation({
    summary: 'Воспроизвести phantom read на READ COMMITTED и REPEATABLE READ',
  })
  demonstratePhantomRead() {
    return this.transactionsLabService.demonstratePhantomRead();
  }

  @Post('deadlock')
  @ApiOperation({
    summary: 'Воспроизвести deadlock на двух параллельных транзакциях',
  })
  simulateDeadlock() {
    return this.transactionsLabService.simulateDeadlock();
  }
}
