import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiErrorResponse } from '../types/api-error-response.type';

type RequestWithId = Request & {
  id?: unknown;
};

type HttpExceptionBody = {
  error?: unknown;
  errorCode?: unknown;
  message?: unknown;
  details?: unknown;
};

type NormalizedException = {
  message: string;
  errorCode: string;
  details?: unknown;
};

/**
 * Глобальный exception filter.
 *
 * Приводит все ошибки API к одному JSON-формату, чтобы клиент, Swagger-примеры,
 * логи и тесты работали с предсказуемой структурой ответа.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithId>();
    const response = context.getResponse<Response>();
    const statusCode = this.getStatusCode(exception);
    const normalized = this.normalizeException(exception, statusCode);
    const requestId = this.getRequestId(request);

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        JSON.stringify({
          event: 'api.error',
          method: request.method,
          path: request.originalUrl,
          statusCode,
          requestId: requestId ?? null,
          errorCode: normalized.errorCode,
          message: normalized.message,
        }),
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const body: ApiErrorResponse = {
      statusCode,
      errorCode: normalized.errorCode,
      message: normalized.message,
      path: request.originalUrl,
      method: request.method,
      timestamp: new Date().toISOString(),
    };

    if (requestId) {
      body.requestId = requestId;
    }

    if (normalized.details !== undefined) {
      body.details = normalized.details;
    }

    response.status(statusCode).json(body);
  }

  /**
   * Возвращает HTTP status, не раскрывая детали неизвестных ошибок.
   */
  private getStatusCode(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }

    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  /**
   * Нормализует разные формы NestJS exceptions в доменный формат ошибки API.
   */
  private normalizeException(
    exception: unknown,
    statusCode: number,
  ): NormalizedException {
    if (!(exception instanceof HttpException)) {
      return {
        message: 'Внутренняя ошибка сервера',
        errorCode: 'INTERNAL_SERVER_ERROR',
      };
    }

    const response = exception.getResponse();

    if (typeof response === 'string') {
      return {
        message: response,
        errorCode: this.defaultErrorCode(statusCode),
      };
    }

    if (this.isRecord(response)) {
      const body = response as HttpExceptionBody;
      const message = this.normalizeMessage(body.message, exception.message);
      const normalized: NormalizedException = {
        message,
        errorCode:
          typeof body.errorCode === 'string'
            ? body.errorCode
            : this.defaultErrorCode(statusCode, body.error),
      };

      if (body.details !== undefined) {
        normalized.details = body.details;
      } else if (Array.isArray(body.message)) {
        normalized.details = body.message;
      }

      return normalized;
    }

    return {
      message: exception.message,
      errorCode: this.defaultErrorCode(statusCode),
    };
  }

  /**
   * Достает request id из pino request object или входящего HTTP header.
   */
  private getRequestId(request: RequestWithId): string | undefined {
    if (typeof request.id === 'string') {
      return request.id;
    }

    const headerValue = request.headers['x-request-id'];

    if (Array.isArray(headerValue)) {
      return headerValue[0];
    }

    return typeof headerValue === 'string' ? headerValue : undefined;
  }

  /**
   * Превращает `message` из Nest exception response в строку для верхнего уровня.
   */
  private normalizeMessage(value: unknown, fallback: string): string {
    if (typeof value === 'string') {
      return value;
    }

    if (
      Array.isArray(value) &&
      value.every((item) => typeof item === 'string')
    ) {
      return value.join('; ');
    }

    return fallback;
  }

  /**
   * Возвращает стабильный код ошибки для клиента.
   */
  private defaultErrorCode(statusCode: number, error?: unknown): string {
    if (typeof error === 'string' && error.length > 0) {
      return error.toUpperCase().replaceAll(' ', '_');
    }

    return HttpStatus[statusCode]?.toString() ?? 'HTTP_ERROR';
  }

  /**
   * Проверяет, что значение является объектом с ключами.
   */
  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
