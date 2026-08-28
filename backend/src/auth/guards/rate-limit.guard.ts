import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  Optional,
} from '@nestjs/common';
import { Request } from 'express';
import { RedisService } from '../../redis/redis.service';

/** In-memory fixed-window limiter для auth endpoints и небольших deployment’ов. */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly windows = new Map<
    string,
    { startedAt: number; count: number }
  >();
  private readonly limit = Number(process.env.RATE_LIMIT_MAX ?? 10);
  private readonly windowMs = Number(
    process.env.RATE_LIMIT_WINDOW_MS ?? 60_000,
  );

  /** Создает limiter с Redis counter и локальным fallback. */
  constructor(@Optional() private readonly redis?: RedisService) {}

  /** Проверяет лимит запроса в Redis или локальном fixed window. */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const key = `${request.ip}:${request.path}`;
    if (this.redis?.isEnabled()) {
      try {
        const count = await this.redis.incrementWithTtl(
          `rate:${key}`,
          Math.ceil(this.windowMs / 1000),
        );
        if (count > this.limit)
          throw new HttpException('Слишком много запросов', 429);
        return true;
      } catch (error) {
        if (error instanceof HttpException) throw error;
        // Redis fail-open: local limiter остается защитой одного инстанса.
      }
    }
    const now = Date.now();
    const current = this.windows.get(key);
    if (!current || now - current.startedAt >= this.windowMs) {
      this.windows.set(key, { startedAt: now, count: 1 });
      return true;
    }
    current.count += 1;
    if (current.count > this.limit)
      throw new HttpException('Слишком много запросов', 429);
    return true;
  }
}
