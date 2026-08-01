import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsController } from './controllers/metrics.controller';
import { HttpMetricsInterceptor } from './interceptors/http-metrics.interceptor';
import { MetricsService } from './services/metrics.service';

/**
 * Модуль метрик.
 *
 * Отвечает за Prometheus endpoint и прикладные метрики.
 */
@Global()
@Module({
  controllers: [MetricsController],
  providers: [
    MetricsService,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
  exports: [MetricsService],
})
export class MetricsModule {}
