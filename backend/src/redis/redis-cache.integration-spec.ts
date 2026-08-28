import { RedisCacheService } from './redis-cache.service';
import { RedisService } from './redis.service';

const describeRedis =
  process.env.RUN_REDIS_TESTS === 'true' ? describe : describe.skip;

describeRedis('Redis cache integration', () => {
  it('supports cache-aside set/get and invalidation', async () => {
    const cache = new RedisCacheService(new RedisService());
    const key = `integration:cache:${process.pid}`;
    await cache.set(key, { value: 'cached' }, 30);
    await expect(cache.get(key)).resolves.toEqual({ value: 'cached' });
    await cache.invalidate(key);
    await expect(cache.get(key)).resolves.toBeNull();
  });
});
