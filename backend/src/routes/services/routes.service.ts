import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  routeSearchDurationSeconds,
  routeSearchTotal,
} from '../../metrics/collectors/prometheus-metrics';
import { CalculateDistanceDto } from '../dto/calculate-distance.dto';
import { NearbyRoutesQueryDto } from '../dto/nearby-routes-query.dto';
import { SearchRouteDto } from '../dto/search-route.dto';
import { RoutesRepository } from '../repositories/routes.repository';
import { RouteMap } from '../types/route-map.type';
import { RouteSearchResult } from '../types/route-search-result.type';

const EARTH_RADIUS_KM = 6371.0088;
const ROUTE_STRATEGY = 'direct_geodesic_with_candidates' as const;

/** Бизнес-логика геодезических расстояний и direct route MVP. */
@Injectable()
export class RoutesService {
  private readonly logger = new Logger(RoutesService.name);

  constructor(private readonly routesRepository: RoutesRepository) {}

  /** Рассчитывает Haversine distance между двумя WGS84-точками. */
  calculateDistance(dto: CalculateDistanceDto): {
    distanceKm: number;
    method: 'haversine';
  } {
    return {
      distanceKm: this.distanceKm(dto.origin, dto.destination),
      method: 'haversine',
    };
  }

  findNearby(query: NearbyRoutesQueryDto) {
    return this.routesRepository.findNearby(query);
  }

  /** Строит прямой маршрут и ранжирует промежуточные карты по detour. */
  async search(dto: SearchRouteDto): Promise<RouteSearchResult> {
    if (dto.originMapId === dto.destinationMapId) {
      throw new BadRequestException(
        'Начальная и конечная карты должны отличаться',
      );
    }

    const startedAt = process.hrtime.bigint();
    let metricResult = 'error';

    try {
      const maps = await this.routesRepository.findMapsByIds([
        dto.originMapId,
        dto.destinationMapId,
      ]);
      const origin = maps.find((map) => map.id === dto.originMapId);
      const destination = maps.find((map) => map.id === dto.destinationMapId);

      if (!origin) {
        throw new NotFoundException(`Карта ${dto.originMapId} не найдена`);
      }
      if (!destination) {
        throw new NotFoundException(`Карта ${dto.destinationMapId} не найдена`);
      }

      const directDistanceKm = this.distanceKm(origin, destination);
      const candidates = await this.routesRepository.findRouteCandidates({
        origin,
        destination,
        radiusKm: dto.candidateRadiusKm,
        limit: dto.limit,
      });
      const rankedCandidates = candidates
        .map((candidate) => {
          const originDistanceKm = this.distanceKm(origin, candidate);
          const destinationDistanceKm = this.distanceKm(candidate, destination);
          const routeDistanceKm = this.round(
            originDistanceKm + destinationDistanceKm,
          );

          return {
            ...candidate,
            originDistanceKm,
            destinationDistanceKm,
            routeDistanceKm,
            detourKm: this.round(routeDistanceKm - directDistanceKm),
          };
        })
        .sort((left, right) => left.detourKm - right.detourKm);

      routeSearchTotal.inc({ strategy: ROUTE_STRATEGY, result: 'success' });
      metricResult = 'success';
      this.logger.log(
        JSON.stringify({
          event: 'route.search_completed',
          strategy: ROUTE_STRATEGY,
          originMapId: origin.id,
          destinationMapId: destination.id,
          directDistanceKm,
          candidatesCount: rankedCandidates.length,
        }),
      );

      return {
        strategy: ROUTE_STRATEGY,
        origin,
        destination,
        directDistanceKm,
        candidates: rankedCandidates,
        disclaimer:
          'Расстояния геодезические; результат не учитывает дороги, трафик и ограничения движения.',
      };
    } catch (error) {
      routeSearchTotal.inc({ strategy: ROUTE_STRATEGY, result: 'error' });
      throw error;
    } finally {
      routeSearchDurationSeconds.observe(
        { strategy: ROUTE_STRATEGY, result: metricResult },
        Number(process.hrtime.bigint() - startedAt) / 1_000_000_000,
      );
    }
  }

  private distanceKm(
    origin: Pick<RouteMap, 'latitude' | 'longitude'>,
    destination: Pick<RouteMap, 'latitude' | 'longitude'>,
  ): number {
    const latitudeDelta = this.toRadians(
      destination.latitude - origin.latitude,
    );
    const longitudeDelta = this.toRadians(
      destination.longitude - origin.longitude,
    );
    const originLatitude = this.toRadians(origin.latitude);
    const destinationLatitude = this.toRadians(destination.latitude);
    const haversine =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(originLatitude) *
        Math.cos(destinationLatitude) *
        Math.sin(longitudeDelta / 2) ** 2;

    return this.round(2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(haversine)));
  }

  private toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }

  private round(value: number): number {
    return Math.round(value * 1000) / 1000;
  }
}
