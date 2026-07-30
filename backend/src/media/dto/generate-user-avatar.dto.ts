import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * DTO генерации avatar для пользователя.
 */
export class GenerateUserAvatarDto {
  @ApiPropertyOptional({
    description: 'Переопределяет `users.avatar_seed` для конкретной генерации.',
    example: 'custom-avatar-seed',
    minLength: 1,
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  seed?: string;
}
