import { MapsRepository } from './maps.repository';

describe('MapsRepository', () => {
  it('нормализует query-параметры Swagger в числа перед SQL-запросом', async () => {
    const pool = {
      query: jest.fn().mockResolvedValue([[]]),
    };
    const repository = new MapsRepository(pool as never);

    await repository.findAll({
      ownerUserId: '1' as never,
      search: 'park',
      limit: '20' as never,
      offset: '0' as never,
    });

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0][1]).toEqual([1, '%park%', 20, 0]);
  });
});
