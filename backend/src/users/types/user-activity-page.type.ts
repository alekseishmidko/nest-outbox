import { UserActivityRecord } from './user-activity-record.type';

/**
 * Страница отчета активности пользователя.
 */
export type UserActivityPage = {
  items: UserActivityRecord[];
  pageInfo: {
    pagination: 'offset' | 'cursor';
    limit: number;
    hasMore: boolean;
    offset?: number;
    nextOffset?: number;
    nextCursor?: string;
  };
};
