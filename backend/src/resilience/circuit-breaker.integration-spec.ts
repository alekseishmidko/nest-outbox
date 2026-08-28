import { CircuitBreaker, CircuitOpenError } from './circuit-breaker';

/** Интеграционный сценарий жизненного цикла policy без внешнего provider. */
describe('Circuit breaker integration lifecycle', () => {
  it('timeout -> open -> half-open -> recovery', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      openDurationMs: 10,
    });
    await expect(
      breaker.execute('storage', async () => {
        throw new Error('storage timeout');
      }),
    ).rejects.toThrow('storage timeout');
    await expect(
      breaker.execute('storage', async () => 'rejected'),
    ).rejects.toBeInstanceOf(CircuitOpenError);
    await new Promise((resolve) => setTimeout(resolve, 15));
    await expect(
      breaker.execute('storage', async () => 'recovered'),
    ).resolves.toBe('recovered');
    expect(breaker.getState('storage')).toBe('closed');
  });
});
