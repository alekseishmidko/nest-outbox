import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
} from '@nestjs/common';
import { Request } from 'express';

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

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const key = `${request.ip}:${request.path}`;
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
