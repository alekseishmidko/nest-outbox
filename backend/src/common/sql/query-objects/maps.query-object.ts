import { ListMapsQueryDto } from '../../../maps/dto/list-maps-query.dto';
import { ownership } from '../specifications/filter-specifications';
import { and, Specification, SqlValue } from '../specifications/specification';

export function createMapsQueryObject(query: ListMapsQueryDto): {
  where: string;
  params: SqlValue[];
  limit: number;
  offset: number;
} {
  const specifications: Specification[] = [];
  if (query.ownerUserId !== undefined) {
    specifications.push(ownership(query.ownerUserId));
  }
  if (query.search) {
    specifications.push({
      toSql: () => ({ sql: 'title LIKE ?', params: [`%${query.search}%`] }),
    });
  }
  const fragment = and(...specifications).toSql();
  return {
    where: fragment.sql === '1 = 1' ? '' : `WHERE ${fragment.sql}`,
    params: fragment.params,
    limit: Number(query.limit ?? 20),
    offset: Number(query.offset ?? 0),
  };
}
