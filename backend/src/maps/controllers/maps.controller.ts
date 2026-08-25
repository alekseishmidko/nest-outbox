import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateMapDto } from '../dto/create-map.dto';
import { ListMapsQueryDto } from '../dto/list-maps-query.dto';
import { UpdateMapDto } from '../dto/update-map.dto';
import { MapsService } from '../services/maps.service';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OwnershipGuard } from '../../auth/guards/ownership.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AuthUser } from '../../auth/types/auth-user.type';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';

@ApiTags('maps')
@Controller('maps')
export class MapsController {
  constructor(private readonly mapsService: MapsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @ApiOperation({ summary: 'Создать карту' })
  create(@Body() dto: CreateMapDto) {
    return this.mapsService.create(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @ApiOperation({ summary: 'Получить список карт' })
  findAll(@Query() query: ListMapsQueryDto) {
    return this.mapsService.findAll(query);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @ApiOperation({ summary: 'Получить карту по id' })
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.mapsService.findById(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @ApiOperation({ summary: 'Обновить карту' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMapDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.mapsService.update(id, dto, user.id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @ApiOperation({ summary: 'Удалить карту' })
  delete(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.mapsService.delete(id, user.id);
  }

  @Post(':id/restore')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  restore(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.mapsService.restore(id, user.id);
  }
}
