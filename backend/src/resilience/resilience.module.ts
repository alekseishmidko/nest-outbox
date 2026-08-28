import { Module } from '@nestjs/common';
import { CircuitBreaker } from './circuit-breaker';

/** Модуль общей политики timeout, retry и circuit breaker внешних интеграций. */
@Module({ providers: [CircuitBreaker], exports: [CircuitBreaker] })
export class ResilienceModule {}
