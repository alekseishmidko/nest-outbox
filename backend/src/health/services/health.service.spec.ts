jest.mock('@dicebear/core', () => ({
  createAvatar: jest.fn(() => ({ toString: () => '<svg />' })),
}));
jest.mock('@dicebear/collection', () => ({ identicon: {} }));

import { HealthService } from './health.service';

describe('HealthService', () => {
  it('keeps liveness independent from infrastructure', () => {
    const service = new HealthService({} as never);
    expect(service.checkLiveness().status).toBe('ok');
  });

  it('checks database, storage and worker for readiness', async () => {
    const database = {
      getPool: () => ({
        query: jest.fn().mockResolvedValue([[{ health_check: 1 }]]),
      }),
    };
    const storage = { checkReadiness: jest.fn().mockResolvedValue(undefined) };
    const worker = { isHealthy: jest.fn().mockReturnValue(true) };
    const service = new HealthService(
      database as never,
      storage as never,
      worker as never,
    );

    await expect(service.checkReadiness()).resolves.toMatchObject({
      status: 'ok',
      database: 'ok',
      storage: 'ok',
      worker: 'ok',
    });
    expect(storage.checkReadiness).toHaveBeenCalled();
    expect(worker.isHealthy).toHaveBeenCalled();
  });
});
