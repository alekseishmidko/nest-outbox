import { RouteMap } from './route-map.type';

export type RouteCandidate = RouteMap & {
  originDistanceKm: number;
  destinationDistanceKm: number;
  routeDistanceKm: number;
  detourKm: number;
};

export type RouteSearchResult = {
  strategy: 'direct_geodesic_with_candidates';
  origin: RouteMap;
  destination: RouteMap;
  directDistanceKm: number;
  candidates: RouteCandidate[];
  disclaimer: string;
};
