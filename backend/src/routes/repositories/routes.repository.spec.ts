import { RoutesRepository } from './routes.repository';

describe('RoutesRepository', () => {
  it('применяет bounding box перед ST_Distance_Sphere', async () => {
    const pool = {
      query: jest.fn().mockResolvedValue([
        [
          {
            id: 1,
            title: 'Nearby',
            latitude: '10.1',
            longitude: '20.1',
            distance_km: '15.5',
          },
        ],
      ]),
    };
    const repository = new RoutesRepository(pool as never);

    const result = await repository.findNearby({
      latitude: 10,
      longitude: 20,
      radiusKm: 25,
      limit: 10,
    });
    const sql = pool.query.mock.calls[0][0] as string;

    expect(sql).toContain('idx_maps_latitude_longitude');
    expect(sql).toContain('latitude BETWEEN ? AND ?');
    expect(sql).toContain('ST_Distance_Sphere');
    expect(result[0]).toEqual({
      id: 1,
      title: 'Nearby',
      latitude: 10.1,
      longitude: 20.1,
      distanceKm: 15.5,
    });
  });
});
