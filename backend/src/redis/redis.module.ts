import { Module } from '@nestjs/common';
import { RedisCacheService } from './redis-cache.service';
import { RedisService } from './redis.service';

/** Модуль optional Redis-кэша и distributed counters. */
@Module({
  providers: [RedisService, RedisCacheService],
  exports: [RedisService, RedisCacheService],
})
export class RedisModule {}
