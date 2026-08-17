import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListOutboxEventsQueryDto } from '../dto/list-outbox-events-query.dto';
import { RetryOutboxEventDto } from '../dto/retry-outbox-event.dto';
import { OutboxService } from '../services/outbox.service';
import { UseGuards } from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';

@ApiTags('outbox')
@Controller('outbox/events')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class OutboxController {
  constructor(private readonly outboxService: OutboxService) {}

  @Get()
  @ApiOperation({ summary: 'Получить список Outbox-событий' })
  findAll(@Query() query: ListOutboxEventsQueryDto) {
    return this.outboxService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить Outbox-событие по id' })
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.outboxService.findById(id);
  }

  @Post(':id/retry')
  @HttpCode(200)
  @ApiOperation({ summary: 'Повторно поставить Outbox-событие в обработку' })
  retry(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RetryOutboxEventDto,
  ) {
    return this.outboxService.retry(id, dto);
  }
}
