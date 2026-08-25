import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  IsInt,
  Min,
} from 'class-validator';

/**
 * DTO обновления карты.
 */
export class UpdateMapDto {
  @ApiPropertyOptional({ description: 'Новый владелец карты.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  ownerUserId?: number;
  @ApiPropertyOptional({
    description: 'Новое название карты.',
    example: 'Updated QR map',
    minLength: 1,
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({
    description: 'Новое описание карты.',
    example: 'Обновленное описание.',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Новая широта.',
    example: 40.785091,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({
    description: 'Новая долгота.',
    example: -73.968285,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsLongitude()
  longitude?: number;
}
