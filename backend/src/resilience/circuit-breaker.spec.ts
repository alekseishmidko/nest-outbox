import {
  CircuitBreaker,
  CircuitOpenError,
  ExternalTimeoutError,
} from './circuit-breaker';

describe('CircuitBreaker', () => {
  it('переводит circuit в open и отклоняет новые вызовы', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      openDurationMs: 100,
    });
    const operation = jest.fn().mockRejectedValue(new Error('provider down'));

    await expect(breaker.execute('storage', operation)).rejects.toThrow(
      'provider down',
    );
    await expect(breaker.execute('storage', operation)).rejects.toThrow(
      'provider down',
    );
    await expect(breaker.execute('storage', operation)).rejects.toBeInstanceOf(
      CircuitOpenError,
    );

    expect(operation).toHaveBeenCalledTimes(2);
    expect(breaker.getState('storage')).toBe('open');
  });

  it('переходит в half-open и закрывается после успешного probe', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      openDurationMs: 5,
    });
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce('ok');

    await expect(breaker.execute('routing', operation)).rejects.toThrow(
      'temporary',
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    await expect(breaker.execute('routing', operation)).resolves.toBe('ok');

    expect(breaker.getState('routing')).toBe('closed');
  });

  it('прерывает долгий вызов единым timeout', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3 });
    const operation = jest.fn(
      (signal: AbortSignal) =>
        new Promise<string>((resolve, reject) => {
          const timer = setTimeout(() => resolve('late'), 50);
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new Error('aborted'));
          });
        }),
    );

    await expect(
      breaker.execute('payment', operation, 5),
    ).rejects.toBeInstanceOf(ExternalTimeoutError);
  });

  it('не повторяет permanent error', async () => {
    const breaker = new CircuitBreaker();
    const error = Object.assign(new Error('bad request'), { statusCode: 400 });
    const operation = jest.fn().mockRejectedValue(error);

    await expect(
      breaker.executeWithRetry('email', operation, 100, { maxAttempts: 3 }),
    ).rejects.toBe(error);

    expect(operation).toHaveBeenCalledTimes(1);
    expect(breaker.getState('email')).toBe('closed');
  });
});
