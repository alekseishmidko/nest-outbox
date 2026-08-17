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
import { UpdateOrderStatusPessimisticDto } from '../dto/update-order-status-pessimistic.dto';
import { OrdersService } from '../services/orders.service';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OwnershipGuard } from '../../auth/guards/ownership.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @UseGuards(JwtAuthGuard, OwnershipGuard)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Получить список заказов' })
  findAll(@Query() query: ListOrdersQueryDto) {
    return this.ordersService.findAll(query);
  }

  @Get('reports/overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({
    summary: 'Получить отчет заказов с JOIN между users, maps и orders',
  })
  findOverview(@Query() query: ListOrdersQueryDto) {
    return this.ordersService.findOverview(query);
  }

  @Get('users/:userId')
  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @ApiOperation({ summary: 'Получить заказы пользователя' })
  findByUserId(
    @Param('userId', ParseIntPipe) userId: number,
    @Query() query: ListOrdersQueryDto,
  ) {
    return this.ordersService.findByUserId(userId, query);
  }

  @Get('maps/:mapId')
  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @ApiOperation({ summary: 'Получить заказы по карте' })
  findByMapId(
    @Param('mapId', ParseIntPipe) mapId: number,
    @Query() query: ListOrdersQueryDto,
  ) {
    return this.ordersService.findByMapId(mapId, query);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @ApiOperation({ summary: 'Получить заказ по id' })
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.findById(id);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @ApiOperation({ summary: 'Изменить статус заказа с optimistic locking' })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(id, dto);
  }

  @Patch(':id/status/pessimistic')
  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @ApiOperation({
    summary: 'Изменить статус внутри транзакции с SELECT ... FOR UPDATE',
  })
  updateStatusPessimistic(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderStatusPessimisticDto,
  ) {
    return this.ordersService.updateStatusPessimistic(id, dto.status);
  }
}
