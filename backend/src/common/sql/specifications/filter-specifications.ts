import { Specification, SqlFragment, SqlValue } from './specification';

type OwnershipColumn = 'owner_user_id' | 'o.user_id' | 'm.owner_user_id';
type StatusColumn = 'status' | 'o.status';
type DateColumn = 'created_at' | 'o.created_at' | 'updated_at';

export function ownership(
  userId: number,
  column: OwnershipColumn = 'owner_user_id',
): Specification {
  return fixedPredicate(`${column} = ?`, [Number(userId)]);
}

export function status(
  value: string,
  column: StatusColumn = 'status',
): Specification {
  return fixedPredicate(`${column} = ?`, [value]);
}

export function dateRange(
  range: { from?: Date | null; to?: Date | null },
  column: DateColumn = 'created_at',
): Specification {
  const predicates: string[] = [];
  const params: SqlValue[] = [];
  if (range.from) {
    predicates.push(`${column} >= ?`);
    params.push(range.from);
  }
  if (range.to) {
    predicates.push(`${column} <= ?`);
    params.push(range.to);
  }
  return fixedPredicate(predicates.join(' AND ') || '1 = 1', params);
}

export function nearby(input: {
  latitude: number;
  longitude: number;
  radiusKm: number;
}): Specification {
  const latitudeDelta = input.radiusKm / 111.32;
  const longitudeDelta =
    input.radiusKm /
    (111.32 *
      Math.max(Math.abs(Math.cos((input.latitude * Math.PI) / 180)), 0.01));
  return fixedPredicate(
    'latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?',
    [
      Math.max(-90, input.latitude - latitudeDelta),
      Math.min(90, input.latitude + latitudeDelta),
      Math.max(-180, input.longitude - longitudeDelta),
      Math.min(180, input.longitude + longitudeDelta),
    ],
  );
}

function fixedPredicate(sql: string, params: SqlValue[]): Specification {
  const fragment: SqlFragment = { sql, params };
  return { toSql: () => ({ sql: fragment.sql, params: [...fragment.params] }) };
}
