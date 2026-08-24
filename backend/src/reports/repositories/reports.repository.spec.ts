import { ReportsRepository } from './reports.repository';

describe('ReportsRepository', () => {
  it('строит GROUP BY отчет по статусам', async () => {
    const pool = {
      query: jest.fn().mockResolvedValue([
        [
          {
            status: 'pending',
            orders_count: 10,
            total_amount_sum: '1000.00',
            average_order_amount: '100.00',
            min_order_amount: '10.00',
            max_order_amount: '500.00',
          },
        ],
      ]),
    };
    const repository = new ReportsRepository(pool as never);

    const result = await repository.findOrderStatusSummary();

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('GROUP BY status'),
    );
    expect(result).toEqual([
      {
        status: 'pending',
        ordersCount: 10,
        totalAmountSum: '1000.00',
        averageOrderAmount: '100.00',
        minOrderAmount: '10.00',
        maxOrderAmount: '500.00',
      },
    ]);
  });

  it('строит ranking отчет с window functions', async () => {
    const pool = {
      query: jest.fn().mockResolvedValue([
        [
          {
            row_num: 1,
            revenue_rank: 1,
            user_id: 10,
            email: 'user@example.com',
            name: 'User',
            orders_count: 3,
            total_amount_sum: '900.00',
            running_revenue: '900.00',
          },
        ],
      ]),
    };
    const repository = new ReportsRepository(pool as never);

    const result = await repository.findUserRevenueRanking({ limit: 5 });

    expect(pool.query.mock.calls[0][0]).toContain('ROW_NUMBER() OVER');
    expect(pool.query.mock.calls[0][0]).toContain('RANK() OVER');
    expect(pool.query.mock.calls[0][0]).toContain('SUM(total_amount_sum) OVER');
    expect(pool.query.mock.calls[0][1]).toEqual([5]);
    expect(result[0]).toEqual({
      rowNumber: 1,
      revenueRank: 1,
      userId: 10,
      email: 'user@example.com',
      name: 'User',
      ordersCount: 3,
      totalAmountSum: '900.00',
      runningRevenue: '900.00',
    });
  });

  it('строит offset pagination запрос', async () => {
    const pool = {
      query: jest.fn().mockResolvedValue([[]]),
    };
    const repository = new ReportsRepository(pool as never);

    await repository.findOrdersPage(
      {
        pagination: 'offset',
        limit: 20,
        offset: 40,
      },
      null,
    );

    expect(pool.query.mock.calls[0][0]).toContain('LIMIT ?');
    expect(pool.query.mock.calls[0][0]).toContain(
      'FORCE INDEX (idx_reports_orders_created_id)',
    );
    expect(pool.query.mock.calls[0][0]).toContain('OFFSET ?');
    expect(pool.query.mock.calls[0][1]).toEqual([21, 40]);
  });

  it('строит cursor pagination запрос', async () => {
    const createdAt = new Date('2026-08-09T00:00:00.000Z');
    const pool = {
      query: jest.fn().mockResolvedValue([[]]),
    };
    const repository = new ReportsRepository(pool as never);

    await repository.findOrdersPage(
      {
        pagination: 'cursor',
        limit: 20,
      },
      {
        createdAt,
        orderId: 100,
      },
    );

    expect(pool.query.mock.calls[0][0]).toContain(
      'WHERE ((o.created_at < ? OR (o.created_at = ? AND o.id < ?)))',
    );
    expect(pool.query.mock.calls[0][0]).not.toContain('OFFSET ?');
    expect(pool.query.mock.calls[0][1]).toEqual([
      createdAt,
      createdAt,
      100,
      21,
    ]);
  });

  it('строит EXPLAIN ANALYZE before через IGNORE INDEX', async () => {
    const pool = {
      query: jest.fn().mockResolvedValue([[{ EXPLAIN: 'plan line' }]]),
    };
    const repository = new ReportsRepository(pool as never);

    const result = await repository.explainAnalyze('orders_page', 'before');

    expect(pool.query.mock.calls[0][0]).toContain('EXPLAIN ANALYZE');
    expect(pool.query.mock.calls[0][0]).toContain('IGNORE INDEX');
    expect(result).toEqual([{ line: 'plan line' }]);
  });
});
