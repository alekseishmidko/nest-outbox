import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsLatitude, IsLongitude, IsNumber } from 'class-validator';

/** Географическая точка в WGS84. */
export class RoutePointDto {
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
}
