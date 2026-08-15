import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

/** Query поиска ближайших карт. */
export class NearbyRoutesQueryDto {
  @ApiProperty({ example: 40.785091 })
  @Type(() => Number)
  @IsNumber()
  @IsLatitude()
  latitude!: number;

  @ApiProperty({ example: -73.968285 })
  @Type(() => Number)
  @IsNumber()
  @IsLongitude()
  longitude!: number;

  @ApiPropertyOptional({ default: 10, minimum: 0.1, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(500)
  radiusKm: number = 10;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
