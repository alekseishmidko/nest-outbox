import {
  BadRequestException,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { ValidationIssue } from '../types/validation-issue.type';

/**
 * Создает глобальный ValidationPipe для HTTP DTO.
 *
 * Pipe удаляет неизвестные поля, запрещает лишние свойства и возвращает
 * ошибки валидации в едином формате, который затем оформляет ApiExceptionFilter.
 */
export function createApiValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: {
      enableImplicitConversion: false,
    },
    exceptionFactory: (errors) =>
      new BadRequestException({
        errorCode: 'VALIDATION_ERROR',
        message: 'Ошибка валидации входных данных',
        details: errors.map(toValidationIssue),
      }),
  });
}

/**
 * Преобразует Nest ValidationError в компактное дерево ошибок DTO.
 */
function toValidationIssue(error: ValidationError): ValidationIssue {
  const issue: ValidationIssue = {
    property: error.property,
    constraints: Object.values(error.constraints ?? {}),
  };

  if (error.children && error.children.length > 0) {
    issue.children = error.children.map(toValidationIssue);
  }

  return issue;
}
