import { createMapsQueryObject } from './maps.query-object';
import { createOrderQueryObject } from './order.query-object';
import { createReportOrdersQueryObject } from './report-orders.query-object';
import { OrderStatus } from '../../../orders/dto/order-status.dto';

describe('SQL query objects', () => {
  it('composes maps ownership/search with bound parameters', () => {
    expect(
      createMapsQueryObject({
        ownerUserId: '7' as never,
        search: "' OR 1=1 --",
        limit: '10' as never,
        offset: '20' as never,
      }),
    ).toEqual({
      where: 'WHERE (owner_user_id = ?) AND (title LIKE ?)',
      params: [7, "%\' OR 1=1 --%"],
      limit: 10,
      offset: 20,
    });
  });

  it('creates status query objects for plain and aliased order queries', () => {
    expect(
      createOrderQueryObject({ status: OrderStatus.Paid, limit: 5, offset: 0 }),
    ).toEqual({
      where: 'WHERE (status = ?)',
      params: ['paid'],
      limit: 5,
      offset: 0,
    });
    expect(
      createOrderQueryObject(
        { status: OrderStatus.Paid, limit: 5, offset: 0 },
        'o',
      ),
    ).toEqual({
      where: 'WHERE (o.status = ?)',
      params: ['paid'],
      limit: 5,
      offset: 0,
    });
  });

  it('combines date range and cursor predicates', () => {
    const from = new Date('2026-08-01T00:00:00.000Z');
    const cursorDate = new Date('2026-08-20T00:00:00.000Z');
    const result = createReportOrdersQueryObject(
      {
        pagination: 'cursor',
        createdFrom: from.toISOString(),
        createdTo: '2026-08-31T23:59:59.000Z',
      },
      { createdAt: cursorDate, orderId: 10 },
    );
    expect(result.where).toContain('o.created_at >= ?');
    expect(result.where).toContain('o.created_at <= ?');
    expect(result.where).toContain('o.id < ?');
    expect(result.params).toEqual([
      from,
      new Date('2026-08-31T23:59:59.000Z'),
      cursorDate,
      cursorDate,
      10,
    ]);
  });
});
