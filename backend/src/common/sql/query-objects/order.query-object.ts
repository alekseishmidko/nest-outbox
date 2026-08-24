import { ListOrdersQueryDto } from '../../../orders/dto/list-orders-query.dto';
import { status } from '../specifications/filter-specifications';
import { and, Specification, SqlValue } from '../specifications/specification';

export function createOrderQueryObject(
  query: ListOrdersQueryDto,
  alias: 'o' | '' = '',
): {
  where: string;
  params: SqlValue[];
  limit: number;
  offset: number;
} {
  const specifications: Specification[] = [];
  if (query.status) {
    specifications.push(
      status(query.status, alias === 'o' ? 'o.status' : 'status'),
    );
  }
  const fragment = and(...specifications).toSql();
  return {
    where: fragment.sql === '1 = 1' ? '' : `WHERE ${fragment.sql}`,
    params: fragment.params,
    limit: Number(query.limit ?? 20),
    offset: Number(query.offset ?? 0),
  };
}
