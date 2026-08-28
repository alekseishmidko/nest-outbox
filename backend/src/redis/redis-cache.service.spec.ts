import { RedisCacheService } from './redis-cache.service';

describe('RedisCacheService', () => {
  it('records cache hit/miss and returns fallback null when Redis is unavailable', async () => {
    const redis = {
      isEnabled: jest.fn().mockReturnValue(true),
      get: jest
        .fn()
        .mockResolvedValueOnce(JSON.stringify({ id: 1 }))
        .mockRejectedValueOnce(new Error('down')),
    };
    const cache = new RedisCacheService(redis as never);

    await expect(cache.get('key')).resolves.toEqual({ id: 1 });
    await expect(cache.get('key')).resolves.toBeNull();
  });

  it('invalidates a key and a related cache namespace', async () => {
    const redis = {
      isEnabled: jest.fn().mockReturnValue(true),
      del: jest.fn().mockResolvedValue(undefined),
      keys: jest.fn().mockResolvedValue(['routes:nearby:1', 'routes:maps:1,2']),
    };
    const cache = new RedisCacheService(redis as never);

    await cache.invalidate('map:1');
    await cache.invalidatePrefix('routes:');
    expect(redis.del).toHaveBeenCalledWith('map:1');
    expect(redis.del).toHaveBeenCalledWith('routes:nearby:1');
    expect(redis.del).toHaveBeenCalledWith('routes:maps:1,2');
  });
});
