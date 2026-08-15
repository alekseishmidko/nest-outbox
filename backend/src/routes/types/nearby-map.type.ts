import { RouteMap } from './route-map.type';

/** Карта и расстояние до заданной точки. */
export type NearbyMap = RouteMap & { distanceKm: number };
