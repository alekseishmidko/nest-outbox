import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateOrderDto } from '../dto/create-order.dto';
import { ListOrdersQueryDto } from '../dto/list-orders-query.dto';
import { UpdateOrderStatusDto } from '../dto/update-order-status.dto';
import { OrdersService } from '../services/orders.service';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      'Ключ идемпотентности для безопасного повтора POST /orders после timeout/retry клиента.',
  })
  @ApiOperation({
    summary: 'Создать заказ и Outbox-событие в одной транзакции',
  })
  create(
    @Body() dto: CreateOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.ordersService.create(dto, idempotencyKey);
  }

  @Get()
  @ApiOperation({ summary: 'Получить список заказов' })
  findAll(@Query() query: ListOrdersQueryDto) {
    return this.ordersService.findAll(query);
  }

  @Get('reports/overview')
  @ApiOperation({
    summary: 'Получить отчет заказов с JOIN между users, maps и orders',
  })
  findOverview(@Query() query: ListOrdersQueryDto) {
    return this.ordersService.findOverview(query);
  }

  @Get('users/:userId')
  @ApiOperation({ summary: 'Получить заказы пользователя' })
  findByUserId(
    @Param('userId', ParseIntPipe) userId: number,
    @Query() query: ListOrdersQueryDto,
  ) {
    return this.ordersService.findByUserId(userId, query);
  }

  @Get('maps/:mapId')
  @ApiOperation({ summary: 'Получить заказы по карте' })
  findByMapId(
    @Param('mapId', ParseIntPipe) mapId: number,
    @Query() query: ListOrdersQueryDto,
  ) {
    return this.ordersService.findByMapId(mapId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить заказ по id' })
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.findById(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Изменить статус заказа' })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(id, dto);
  }
}
