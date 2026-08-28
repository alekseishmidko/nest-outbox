import { Inject, Injectable, Optional } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { MYSQL_POOL } from '../../database/connections/mysql-pool.token';
import { NearbyMap } from '../types/nearby-map.type';
import { RouteMap } from '../types/route-map.type';
import { RouteMapRow } from '../types/route-map-row.type';
import { nearby } from '../../common/sql/specifications/filter-specifications';
import { RedisCacheService } from '../../redis/redis-cache.service';

const KM_PER_LATITUDE_DEGREE = 111.32;

/** SQL-доступ к географическому поиску карт. */
@Injectable()
export class RoutesRepository {
  /** Создает SQL repository с optional cache-aside слоем Redis. */
  constructor(
    @Inject(MYSQL_POOL) private readonly pool: Pool,
    @Optional() private readonly cache?: RedisCacheService,
  ) {}

  /** Ищет карты через bounding box и точный `ST_Distance_Sphere`. */
  async findNearby(input: {
    latitude: number;
    longitude: number;
    radiusKm: number;
    limit: number;
  }): Promise<NearbyMap[]> {
    const cacheKey = `routes:nearby:${input.latitude}:${input.longitude}:${input.radiusKm}:${input.limit}`;
    const cached = await this.cache?.get<NearbyMap[]>(cacheKey);
    if (cached) return cached;
    const nearbyWhere = nearby(input).toSql();
    const [rows] = await this.pool.query<RouteMapRow[]>(
      `
        SELECT
          id,
          title,
          latitude,
          longitude,
          ST_Distance_Sphere(
            POINT(longitude, latitude),
            POINT(?, ?)
          ) / 1000 AS distance_km
        FROM maps FORCE INDEX (idx_maps_latitude_longitude)
        WHERE ${nearbyWhere.sql}
        HAVING distance_km <= ?
        ORDER BY distance_km ASC, id ASC
        LIMIT ?
      `,
      [
        input.longitude,
        input.latitude,
        ...nearbyWhere.params,
        input.radiusKm,
        input.limit,
      ],
    );

    const result = rows.map((row) => ({
      ...this.toMap(row),
      distanceKm: Number(row.distance_km),
    }));
    await this.cache?.set(cacheKey, result, 30);
    return result;
  }

  /** Возвращает маршрутные данные двух карт одним запросом. */
  async findMapsByIds(ids: number[]): Promise<RouteMap[]> {
    const cacheKey = `routes:maps:${[...ids].sort((a, b) => a - b).join(',')}`;
    const cached = await this.cache?.get<RouteMap[]>(cacheKey);
    if (cached) return cached;
    const [rows] = await this.pool.query<RouteMapRow[]>(
      `
        SELECT id, title, latitude, longitude
        FROM maps
        WHERE id IN (?, ?)
      `,
      ids,
    );

    const result = rows.map(this.toMap);
    await this.cache?.set(cacheKey, result, 300);
    return result;
  }

  /**
   * Ищет промежуточные точки в расширенном bbox между концами маршрута.
   * Финальное ранжирование по detour выполняет service.
   */
  async findRouteCandidates(input: {
    origin: RouteMap;
    destination: RouteMap;
    radiusKm: number;
    limit: number;
  }): Promise<RouteMap[]> {
    const middleLatitude =
      (input.origin.latitude + input.destination.latitude) / 2;
    const latitudeDelta = input.radiusKm / KM_PER_LATITUDE_DEGREE;
    const longitudeDelta = this.longitudeDelta(middleLatitude, input.radiusKm);
    const [rows] = await this.pool.query<RouteMapRow[]>(
      `
        SELECT id, title, latitude, longitude
        FROM maps FORCE INDEX (idx_maps_latitude_longitude)
        WHERE latitude BETWEEN ? AND ?
          AND longitude BETWEEN ? AND ?
          AND id NOT IN (?, ?)
        ORDER BY
          ST_Distance_Sphere(
            POINT(longitude, latitude),
            POINT(?, ?)
          ) +
          ST_Distance_Sphere(
            POINT(longitude, latitude),
            POINT(?, ?)
          ) ASC,
          id ASC
        LIMIT ?
      `,
      [
        Math.max(
          -90,
          Math.min(input.origin.latitude, input.destination.latitude) -
            latitudeDelta,
        ),
        Math.min(
          90,
          Math.max(input.origin.latitude, input.destination.latitude) +
            latitudeDelta,
        ),
        Math.max(
          -180,
          Math.min(input.origin.longitude, input.destination.longitude) -
            longitudeDelta,
        ),
        Math.min(
          180,
          Math.max(input.origin.longitude, input.destination.longitude) +
            longitudeDelta,
        ),
        input.origin.id,
        input.destination.id,
        input.origin.longitude,
        input.origin.latitude,
        input.destination.longitude,
        input.destination.latitude,
        input.limit,
      ],
    );

    return rows.map(this.toMap);
  }

  private longitudeDelta(latitude: number, radiusKm: number): number {
    const cosine = Math.max(
      Math.abs(Math.cos((latitude * Math.PI) / 180)),
      0.01,
    );
    return radiusKm / (KM_PER_LATITUDE_DEGREE * cosine);
  }

  private toMap(row: RouteMapRow): RouteMap {
    return {
      id: row.id,
      title: row.title,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
    };
  }
}
