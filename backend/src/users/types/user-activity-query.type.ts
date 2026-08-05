import { UserActivityCursor } from './user-activity-cursor.type';

/**
 * Нормализованные параметры repository-запроса активности пользователя.
 */
export type UserActivityQuery = {
  pagination: 'offset' | 'cursor';
  limit: number;
  offset: number;
  cursor: UserActivityCursor | null;
};
