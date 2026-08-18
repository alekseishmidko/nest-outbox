import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InboxService } from '../services/inbox.service';
import { ReceiveInboxEventDto } from '../dto/receive-inbox-event.dto';

/** HTTP endpoint приема внешних событий в Inbox. */
@ApiTags('inbox')
@Controller('inbox')
export class InboxController {
  constructor(private readonly inboxService: InboxService) {}

  /** Принимает событие и безопасно отвечает на повторную доставку. */
  @Post('events')
  @ApiOperation({ summary: 'Принять входящее событие в Inbox' })
  receive(@Body() dto: ReceiveInboxEventDto) {
    return this.inboxService.receive(dto);
  }
}
