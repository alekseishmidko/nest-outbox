import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * DTO обновления пользователя.
 */
export class UpdateUserDto {
  @ApiPropertyOptional({
    description: 'Новый email пользователя. Должен быть уникальным.',
    example: 'new-user@example.com',
    maxLength: 320,
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @ApiPropertyOptional({
    description: 'Новое отображаемое имя пользователя.',
    example: 'Alex Updated',
    minLength: 1,
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    description: 'Новый seed для генерации avatar.',
    example: 'alex-updated-seed',
    minLength: 1,
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  avatarSeed?: string;
}
