import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ValidateNested } from 'class-validator';
import { RoutePointDto } from './route-point.dto';

/** DTO расчета прямого геодезического расстояния. */
export class CalculateDistanceDto {
  @ApiProperty({ type: RoutePointDto })
  @ValidateNested()
  @Type(() => RoutePointDto)
  origin!: RoutePointDto;

  @ApiProperty({ type: RoutePointDto })
  @ValidateNested()
  @Type(() => RoutePointDto)
  destination!: RoutePointDto;
}
