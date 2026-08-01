import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { MetricsService } from '../services/metrics.service';

/**
 * Interceptor записи HTTP-метрик.
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  /**
   * Измеряет latency, method, route и status code каждого HTTP-запроса.
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const startedAt = process.hrtime.bigint();

    return next.handle().pipe(
      finalize(() => {
        const durationSeconds =
          Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;

        this.metricsService.observeHttpRequest({
          method: request.method,
          route: this.getRoute(request),
          statusCode: response.statusCode,
          durationSeconds,
        });
      }),
    );
  }

  private getRoute(request: Request): string {
    return request.route?.path
      ? `${request.baseUrl}${request.route.path}`
      : request.path;
  }
}
