import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * DTO ручного retry Outbox-события.
 */
export class RetryOutboxEventDto {
  @ApiProperty({
    description: 'Причина ручного повтора обработки события.',
    example: 'Исправлена внешняя ошибка генерации media, можно повторить.',
    minLength: 3,
    maxLength: 512,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(512)
  reason!: string;
}
