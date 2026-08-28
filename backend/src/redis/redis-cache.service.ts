import { Injectable } from '@nestjs/common';
import {
  cacheHitsTotal,
  cacheMissesTotal,
} from '../metrics/collectors/prometheus-metrics';
import { RedisService } from './redis.service';

/** Cache-aside facade с fail-open поведением при недоступном Redis. */
@Injectable()
export class RedisCacheService {
  /** Создает cache-aside facade поверх optional Redis adapter. */
  constructor(private readonly redis: RedisService) {}

  /** Возвращает кэшированное значение и фиксирует hit/miss метрику. */
  async get<T>(key: string): Promise<T | null> {
    if (!this.redis.isEnabled()) return null;
    try {
      const value = await this.redis.get(key);
      if (value === null) {
        cacheMissesTotal.inc({ cache: 'redis' });
        return null;
      }
      cacheHitsTotal.inc({ cache: 'redis' });
      return JSON.parse(value) as T;
    } catch {
      cacheMissesTotal.inc({ cache: 'redis' });
      return null;
    }
  }

  /** Сохраняет сериализованное значение с заданным сроком жизни. */
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (!this.redis.isEnabled()) return;
    try {
      await this.redis.set(key, JSON.stringify(value), ttlSeconds);
    } catch {
      /* fallback is DB */
    }
  }

  /** Удаляет перечисленные ключи; ошибка Redis не ломает основной запрос. */
  async invalidate(...keys: string[]): Promise<void> {
    for (const key of keys) {
      try {
        await this.redis.del(key);
      } catch {
        /* fallback is stale-free DB read */
      }
    }
  }

  /** Инвалидирует все ключи одного namespace. */
  async invalidatePrefix(prefix: string): Promise<void> {
    if (!this.redis.isEnabled()) return;
    try {
      await this.invalidate(...(await this.redis.keys(`${prefix}*`)));
    } catch {
      // fallback is short TTL and DB reads
    }
  }
}
