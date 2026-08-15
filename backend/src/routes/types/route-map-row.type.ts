import { RowDataPacket } from 'mysql2';

export type RouteMapRow = RowDataPacket & {
  id: number;
  title: string;
  latitude: string;
  longitude: string;
  distance_km?: string | number;
};
