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

@ApiTags('maps')
@Controller('maps')
export class MapsController {
  constructor(private readonly mapsService: MapsService) {}

  @Post()
  @ApiOperation({ summary: 'Создать карту' })
  create(@Body() dto: CreateMapDto) {
    return this.mapsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Получить список карт' })
  findAll(@Query() query: ListMapsQueryDto) {
    return this.mapsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить карту по id' })
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.mapsService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Обновить карту' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMapDto) {
    return this.mapsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить карту' })
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.mapsService.delete(id);
  }
}
