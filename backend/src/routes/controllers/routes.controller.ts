import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CalculateDistanceDto } from '../dto/calculate-distance.dto';
import { NearbyRoutesQueryDto } from '../dto/nearby-routes-query.dto';
import { SearchRouteDto } from '../dto/search-route.dto';
import { RoutesService } from '../services/routes.service';

@ApiTags('routes')
@Controller('routes')
export class RoutesController {
  constructor(private readonly routesService: RoutesService) {}

  @Post('distance')
  @ApiOperation({ summary: 'Рассчитать геодезическое расстояние' })
  calculateDistance(@Body() dto: CalculateDistanceDto) {
    return this.routesService.calculateDistance(dto);
  }

  @Get('nearby')
  @ApiOperation({ summary: 'Найти карты в заданном радиусе' })
  findNearby(@Query() query: NearbyRoutesQueryDto) {
    return this.routesService.findNearby(query);
  }

  @Post('search')
  @ApiOperation({ summary: 'Подобрать direct route и промежуточные карты' })
  search(@Body() dto: SearchRouteDto) {
    return this.routesService.search(dto);
  }
}
