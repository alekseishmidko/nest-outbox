import { dateRange, nearby, ownership, status } from './filter-specifications';
import { and, not, or } from './specification';

describe('SQL filter specifications', () => {
  it('builds ownership with a bound user id', () => {
    expect(ownership(7).toSql()).toEqual({
      sql: 'owner_user_id = ?',
      params: [7],
    });
  });

  it('builds status and date range without interpolating values', () => {
    const from = new Date('2026-08-01T00:00:00.000Z');
    const to = new Date('2026-08-31T23:59:59.000Z');
    expect(status('paid', 'o.status').toSql()).toEqual({
      sql: 'o.status = ?',
      params: ['paid'],
    });
    expect(dateRange({ from, to }, 'o.created_at').toSql()).toEqual({
      sql: 'o.created_at >= ? AND o.created_at <= ?',
      params: [from, to],
    });
  });

  it('builds nearby bounding-box values in a deterministic order', () => {
    const fragment = nearby({
      latitude: 40,
      longitude: -73,
      radiusKm: 10,
    }).toSql();
    expect(fragment.sql).toBe(
      'latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?',
    );
    expect(fragment.params).toHaveLength(4);
    expect(fragment.params[0]).toBeLessThan(40);
    expect(fragment.params[1]).toBeGreaterThan(40);
    expect(fragment.params[2]).toBeLessThan(-73);
    expect(fragment.params[3]).toBeGreaterThan(-73);
  });

  it('composes and/or/not while preserving parameter order', () => {
    const fragment = and(
      ownership(7),
      or(status('paid'), not(status('cancelled'))),
    ).toSql();
    expect(fragment.sql).toBe(
      '(owner_user_id = ?) AND ((status = ?) OR (NOT (status = ?)))',
    );
    expect(fragment.params).toEqual([7, 'paid', 'cancelled']);
  });
});
