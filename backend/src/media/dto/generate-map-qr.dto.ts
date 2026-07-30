import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * DTO генерации QR-code для карты.
 */
export class GenerateMapQrDto {
  @ApiPropertyOptional({
    description: 'URL, который будет закодирован в QR-code.',
    example: 'https://example.com/maps/1',
    maxLength: 2048,
  })
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  url?: string;

  @ApiPropertyOptional({
    description:
      'Произвольный payload для QR-code. Используется, если `url` не передан.',
    example: '{"mapId":1,"source":"manual"}',
    minLength: 1,
    maxLength: 4096,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  payload?: string;
}
