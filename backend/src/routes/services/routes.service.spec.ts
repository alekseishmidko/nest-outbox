import { RoutesRepository } from '../repositories/routes.repository';
import { RoutesService } from './routes.service';

describe('RoutesService', () => {
  it('считает Haversine distance между Парижем и Лондоном', () => {
    const service = new RoutesService({} as RoutesRepository);

    const result = service.calculateDistance({
      origin: { latitude: 48.8566, longitude: 2.3522 },
      destination: { latitude: 51.5074, longitude: -0.1278 },
    });

    expect(result.method).toBe('haversine');
    expect(result.distanceKm).toBeCloseTo(343.6, 0);
  });

  it('ранжирует промежуточные карты по минимальному detour', async () => {
    const repository = {
      findMapsByIds: jest.fn().mockResolvedValue([
        { id: 1, title: 'A', latitude: 0, longitude: 0 },
        { id: 2, title: 'B', latitude: 0, longitude: 2 },
      ]),
      findRouteCandidates: jest.fn().mockResolvedValue([
        { id: 3, title: 'Far', latitude: 1, longitude: 1 },
        { id: 4, title: 'On route', latitude: 0, longitude: 1 },
      ]),
    };
    const service = new RoutesService(
      repository as unknown as RoutesRepository,
    );

    const result = await service.search({
      originMapId: 1,
      destinationMapId: 2,
      candidateRadiusKm: 25,
      limit: 10,
    });

    expect(result.strategy).toBe('direct_geodesic_with_candidates');
    expect(result.candidates.map((candidate) => candidate.id)).toEqual([4, 3]);
    expect(result.candidates[0]?.detourKm).toBeCloseTo(0, 2);
  });
});
