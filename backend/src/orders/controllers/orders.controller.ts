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
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OwnershipGuard } from '../../auth/guards/ownership.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AuthUser } from '../../auth/types/auth-user.type';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { CreateOrderHandler } from '../commands/create-order.handler';
import { UpdateOrderStatusHandler } from '../commands/update-order-status.handler';
import {
  ListOrdersQueryHandler,
  OrderOverviewQueryHandler,
} from '../queries/orders-query.handlers';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly createOrderHandler: CreateOrderHandler,
    private readonly updateOrderStatusHandler: UpdateOrderStatusHandler,
    private readonly listOrdersQueryHandler: ListOrdersQueryHandler,
    private readonly orderOverviewQueryHandler: OrderOverviewQueryHandler,
  ) {}

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
    return this.createOrderHandler.execute(dto, idempotencyKey);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Получить список заказов' })
  findAll(@Query() query: ListOrdersQueryDto) {
    return this.listOrdersQueryHandler.execute(query);
  }

  @Get('reports/overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({
    summary: 'Получить отчет заказов с JOIN между users, maps и orders',
  })
  findOverview(@Query() query: ListOrdersQueryDto) {
    return this.orderOverviewQueryHandler.execute(query);
  }

  @Get('users/:userId')
  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @ApiOperation({ summary: 'Получить заказы пользователя' })
  findByUserId(
    @Param('userId', ParseIntPipe) userId: number,
    @Query() query: ListOrdersQueryDto,
  ) {
    return this.listOrdersQueryHandler.byUser(userId, query);
  }

  @Get('maps/:mapId')
  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @ApiOperation({ summary: 'Получить заказы по карте' })
  findByMapId(
    @Param('mapId', ParseIntPipe) mapId: number,
    @Query() query: ListOrdersQueryDto,
  ) {
    return this.listOrdersQueryHandler.byMap(mapId, query);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @ApiOperation({ summary: 'Получить заказ по id' })
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.listOrdersQueryHandler.byId(id);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @ApiOperation({ summary: 'Изменить статус заказа с optimistic locking' })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.updateOrderStatusHandler.execute(id, dto, user.id);
  }

  @Patch(':id/status/pessimistic')
  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @ApiOperation({
    summary: 'Изменить статус внутри транзакции с SELECT ... FOR UPDATE',
  })
  updateStatusPessimistic(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderStatusPessimisticDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.updateOrderStatusHandler.executePessimistic(
      id,
      dto.status,
      user.id,
    );
  }
}
