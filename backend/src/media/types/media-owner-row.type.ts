import { RowDataPacket } from 'mysql2';

/**
 * Минимальные данные пользователя для генерации avatar.
 */
export type MediaUserRow = RowDataPacket & {
  id: number;
  email: string;
  name: string;
  avatar_seed: string;
};

/**
 * Минимальные данные карты для генерации QR-code.
 */
export type MediaMapRow = RowDataPacket & {
  id: number;
  title: string;
  description: string | null;
  latitude: string;
  longitude: string;
  owner_user_id: number;
};
