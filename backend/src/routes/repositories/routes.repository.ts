import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { MYSQL_POOL } from '../../database/connections/mysql-pool.token';
import { NearbyMap } from '../types/nearby-map.type';
import { RouteMap } from '../types/route-map.type';
import { RouteMapRow } from '../types/route-map-row.type';

const KM_PER_LATITUDE_DEGREE = 111.32;

/** SQL-доступ к географическому поиску карт. */
@Injectable()
export class RoutesRepository {
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  /** Ищет карты через bounding box и точный `ST_Distance_Sphere`. */
  async findNearby(input: {
    latitude: number;
    longitude: number;
    radiusKm: number;
    limit: number;
  }): Promise<NearbyMap[]> {
    const bounds = this.createBounds(
      input.latitude,
      input.longitude,
      input.radiusKm,
    );
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
        WHERE latitude BETWEEN ? AND ?
          AND longitude BETWEEN ? AND ?
        HAVING distance_km <= ?
        ORDER BY distance_km ASC, id ASC
        LIMIT ?
      `,
      [
        input.longitude,
        input.latitude,
        bounds.minLatitude,
        bounds.maxLatitude,
        bounds.minLongitude,
        bounds.maxLongitude,
        input.radiusKm,
        input.limit,
      ],
    );

    return rows.map((row) => ({
      ...this.toMap(row),
      distanceKm: Number(row.distance_km),
    }));
  }

  /** Возвращает маршрутные данные двух карт одним запросом. */
  async findMapsByIds(ids: number[]): Promise<RouteMap[]> {
    const [rows] = await this.pool.query<RouteMapRow[]>(
      `
        SELECT id, title, latitude, longitude
        FROM maps
        WHERE id IN (?, ?)
      `,
      ids,
    );

    return rows.map(this.toMap);
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

  private createBounds(latitude: number, longitude: number, radiusKm: number) {
    const latitudeDelta = radiusKm / KM_PER_LATITUDE_DEGREE;
    const longitudeDelta = this.longitudeDelta(latitude, radiusKm);

    return {
      minLatitude: Math.max(-90, latitude - latitudeDelta),
      maxLatitude: Math.min(90, latitude + latitudeDelta),
      minLongitude: Math.max(-180, longitude - longitudeDelta),
      maxLongitude: Math.min(180, longitude + longitudeDelta),
    };
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
