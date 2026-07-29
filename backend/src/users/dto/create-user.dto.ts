import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * DTO создания пользователя.
 */
export class CreateUserDto {
  @ApiProperty({
    description: 'Email пользователя. Должен быть уникальным.',
    example: 'user@example.com',
    maxLength: 320,
  })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({
    description: 'Отображаемое имя пользователя.',
    example: 'Alex',
    minLength: 1,
    maxLength: 255,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiProperty({
    description:
      'Seed для генерации avatar. Если не передан, будет создан автоматически.',
    example: 'alex-avatar-seed',
    required: false,
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  avatarSeed?: string;
}
