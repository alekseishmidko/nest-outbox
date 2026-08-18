import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsString, MaxLength, MinLength } from 'class-validator';

/** DTO приема внешнего события в Inbox. */
export class ReceiveInboxEventDto {
  @ApiProperty({ example: 'payment-evt-123' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  eventId!: string;

  @ApiProperty({ example: 'payment.completed' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  eventType!: string;

  @ApiProperty({ example: { orderId: 42, amount: 199.9 } })
  @IsObject()
  payload!: Record<string, unknown>;
}
