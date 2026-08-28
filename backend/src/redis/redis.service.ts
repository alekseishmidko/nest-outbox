import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createConnection } from 'node:net';
import { URL } from 'node:url';

type RedisValue = string | number | null | RedisValue[];

/** Минимальный Redis RESP adapter для cache-aside и атомарного rate limit. */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly url = process.env.REDIS_URL
    ? new URL(process.env.REDIS_URL)
    : null;
  private readonly timeoutMs = Number(process.env.REDIS_TIMEOUT_MS ?? 500);

  /** Возвращает true, если в окружении задан адрес Redis. */
  isEnabled(): boolean {
    return this.url !== null;
  }

  /** Читает строковое значение по ключу. */
  async get(key: string): Promise<string | null> {
    return (await this.command(['GET', key])) as string | null;
  }

  /** Записывает значение с обязательным TTL, чтобы кэш не стал вечным. */
  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.command(['SET', key, value, 'EX', String(ttlSeconds)]);
  }

  /** Удаляет один ключ из Redis. */
  async del(key: string): Promise<void> {
    await this.command(['DEL', key]);
  }

  /** Возвращает ключи namespace для точечной invalidation кэша. */
  async keys(pattern: string): Promise<string[]> {
    const value = await this.command(['KEYS', pattern]);
    return Array.isArray(value) ? value.map(String) : [];
  }

  /** INCR + EXPIRE выполняются атомарно, поэтому счетчик общий для инстансов. */
  /** Увеличивает distributed counter и атомарно назначает его TTL. */
  async incrementWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const value = await this.command([
      'EVAL',
      'local count = redis.call("incr", KEYS[1]); if count == 1 then redis.call("expire", KEYS[1], ARGV[1]); end; return count',
      '1',
      key,
      String(ttlSeconds),
    ]);
    return Number(value);
  }

  /** Проверяет соединение с Redis командой PING. */
  async ping(): Promise<void> {
    if (this.isEnabled()) await this.command(['PING']);
  }

  /** Освобождает lifecycle Redis adapter; соединения закрываются после команды. */
  async onModuleDestroy(): Promise<void> {}

  /** Выполняет одну RESP-команду с ограничением времени ожидания. */
  private command(parts: string[]): Promise<RedisValue> {
    if (!this.url) return Promise.reject(new Error('Redis is disabled'));
    const socket = createConnection({
      host: this.url.hostname,
      port: Number(this.url.port || 6379),
    });
    const payload = `*${parts.length}\r\n${parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join('')}`;
    return new Promise<RedisValue>((resolve, reject) => {
      let buffer = Buffer.alloc(0);
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error('Redis command timeout'));
      }, this.timeoutMs);
      const finish = (error?: Error, value?: RedisValue) => {
        clearTimeout(timer);
        socket.destroy();
        if (error) reject(error);
        else resolve(value ?? null);
      };
      socket.on('error', (error) => finish(error));
      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        const parsed = parseResponse(buffer);
        if (!parsed) return;
        if (parsed.error) finish(new Error(parsed.error));
        else finish(undefined, parsed.value);
      });
      socket.on('connect', () => socket.write(payload));
    }).catch((error: unknown) => {
      this.logger.debug(
        `Redis unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    });
  }
}

/** Разбирает простой RESP response, включая bulk string и массив ключей. */
function parseResponse(
  buffer: Buffer,
): { value: RedisValue; error?: string } | null {
  const text = buffer.toString('utf8');
  const end = text.indexOf('\r\n');
  if (end < 0) return null;
  const header = text.slice(0, end);
  if (header.startsWith('-')) return { value: null, error: header.slice(1) };
  if (header.startsWith(':')) return { value: Number(header.slice(1)) };
  if (header.startsWith('+')) return { value: header.slice(1) };
  if (header.startsWith('*')) {
    const count = Number(header.slice(1));
    let offset = end + 2;
    const values: RedisValue[] = [];
    for (let index = 0; index < count; index++) {
      const parsed = parseResponse(buffer.subarray(offset));
      if (!parsed) return null;
      values.push(parsed.value);
      const childText = buffer.subarray(offset).toString('utf8');
      const childEnd = childText.indexOf('\r\n');
      const childLength = childText.startsWith('$')
        ? Number(childText.slice(1, childEnd))
        : 0;
      offset += childLength > 0 ? childEnd + 2 + childLength + 2 : childEnd + 2;
    }
    return { value: values };
  }
  if (header.startsWith('$')) {
    const length = Number(header.slice(1));
    if (length === -1) return { value: null };
    const start = end + 2;
    if (buffer.length < start + length + 2) return null;
    return { value: text.slice(start, start + length) };
  }
  return null;
}
