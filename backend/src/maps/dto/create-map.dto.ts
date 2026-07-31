import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsLatitude,
  IsInt,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * DTO создания карты.
 */
export class CreateMapDto {
  @ApiProperty({
    description: 'Название карты.',
    example: 'Central Park QR map',
    minLength: 1,
    maxLength: 255,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title!: string;

  @ApiProperty({
    description: 'Описание карты.',
    example: 'Точка для генерации QR-code.',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Широта.',
    example: 40.785091,
  })
  @Type(() => Number)
  @IsNumber()
  @IsLatitude()
  latitude!: number;

  @ApiProperty({
    description: 'Долгота.',
    example: -73.968285,
  })
  @Type(() => Number)
  @IsNumber()
  @IsLongitude()
  longitude!: number;

  @ApiProperty({
    description: 'ID пользователя-владельца карты.',
    example: 1,
  })
  @Type(() => Number)
  @IsInt()
  ownerUserId!: number;
}
