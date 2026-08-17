import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh JWT из предыдущего login/refresh.' })
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}
