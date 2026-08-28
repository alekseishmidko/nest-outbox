import { Injectable, Optional } from '@nestjs/common';
import {
  circuitBreakerRejectedTotal,
  circuitBreakerRecoverySeconds,
  circuitBreakerStateChangesTotal,
} from '../metrics/collectors/prometheus-metrics';
import { getExternalTimeout } from './external-timeout.policy';

/**
 * Состояние защиты зависимости.
 *
 * `closed` пропускает вызовы и считает transient failures. `open` не делает
 * сетевых вызовов в течение cooldown. `half-open` разрешает ровно один probe,
 * чтобы проверить восстановление провайдера.
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

export class CircuitOpenError extends Error {
  /** Создает ошибку, сообщающую вызывающему коду о fast-fail режиме. */
  constructor(public readonly serviceName: string) {
    super(`Circuit is open for ${serviceName}`);
    this.name = 'CircuitOpenError';
  }
}

export class ExternalTimeoutError extends Error {
  /** Сохраняет имя зависимости и примененный timeout для диагностики. */
  constructor(
    public readonly serviceName: string,
    public readonly timeoutMs: number,
  ) {
    super(`${serviceName} timed out after ${timeoutMs}ms`);
    this.name = 'ExternalTimeoutError';
  }
}

/** Параметры порога отказов и длительности open cooldown. */
export type CircuitBreakerOptions = {
  /** Число transient failures до перевода circuit в `open`. */
  failureThreshold?: number;
  /** Пауза перед разрешением диагностического probe. */
  openDurationMs?: number;
};

/** Ограничители количества попыток и exponential backoff. */
export type RetryOptions = {
  /** Максимальное число вызовов, включая первую попытку. */
  maxAttempts?: number;
  /** Начальная задержка между попытками в миллисекундах. */
  baseDelayMs?: number;
  /** Верхняя граница exponential backoff. */
  maxDelayMs?: number;
};

type CircuitData = {
  state: CircuitState;
  failures: number;
  openedAt: number;
  probeInFlight: boolean;
};

/** Общая политика timeout/retry/circuit breaker для внешних провайдеров. */
@Injectable()
export class CircuitBreaker {
  private readonly failureThreshold: number;
  private readonly openDurationMs: number;
  private readonly circuits = new Map<string, CircuitData>();

  /** Создает policy и читает настройки из env, если options не переданы. */
  constructor(@Optional() options: CircuitBreakerOptions = {}) {
    this.failureThreshold =
      options.failureThreshold ??
      Number(process.env.CIRCUIT_FAILURE_THRESHOLD ?? 3);
    this.openDurationMs =
      options.openDurationMs ??
      Number(process.env.CIRCUIT_OPEN_DURATION_MS ?? 10_000);
  }

  /**
   * Возвращает состояние конкретной зависимости.
   *
   * Circuit хранится по serviceName, поэтому сбой storage не блокирует email,
   * routing или payment. Такой раздельный state важен для общего Nest provider.
   */
  getState(serviceName = 'default'): CircuitState {
    return this.getCircuit(serviceName).state;
  }

  /**
   * Выполняет одну попытку внешней операции.
   *
   * Сначала проверяется fast-fail правило. Затем создается AbortController и
   * timer; провайдер обязан передать signal в fetch/SDK, чтобы timeout реально
   * прерывал работу, а не только прекращал ожидание ответа. Успех сбрасывает
   * счетчик failures, transient error увеличивает его, permanent error не
   * влияет на circuit. Для half-open попытки finally освобождает probe lock.
   */
  async execute<T>(
    serviceName: string,
    operation: (signal: AbortSignal) => Promise<T>,
    timeoutMs = getExternalTimeout(serviceName),
  ): Promise<T> {
    const circuit = this.getCircuit(serviceName);
    if (!this.allowRequest(serviceName)) {
      circuitBreakerRejectedTotal.inc({ service: serviceName });
      throw new CircuitOpenError(serviceName);
    }
    const wasProbe = circuit.state === 'half-open';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const result = await operation(controller.signal).catch(
        (error: unknown) => {
          if (controller.signal.aborted)
            throw new ExternalTimeoutError(serviceName, timeoutMs);
          throw error;
        },
      );
      this.onSuccess(serviceName, circuit);
      return result;
    } catch (error) {
      if (!isPermanentError(error)) this.onFailure(serviceName, circuit);
      throw error;
    } finally {
      clearTimeout(timer);
      if (wasProbe) circuit.probeInFlight = false;
    }
  }

  /**
   * Выполняет операцию с ограниченным exponential retry.
   *
   * Каждый retry снова проходит через circuit, поэтому после открытия новые
   * попытки не доходят до провайдера. HTTP 4xx и ошибки с permanent=true
   * прекращают цикл немедленно; это защищает от повторения невалидных запросов
   * и потенциально опасных платежных операций.
   */
  async executeWithRetry<T>(
    serviceName: string,
    operation: (signal: AbortSignal) => Promise<T>,
    timeoutMs?: number,
    options: RetryOptions = {},
  ): Promise<T> {
    const maxAttempts = Math.max(1, options.maxAttempts ?? 2);
    const baseDelayMs = options.baseDelayMs ?? 50;
    const maxDelayMs = options.maxDelayMs ?? 500;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.execute(serviceName, operation, timeoutMs);
      } catch (error) {
        lastError = error;
        if (
          isPermanentError(error) ||
          error instanceof CircuitOpenError ||
          attempt === maxAttempts
        )
          throw error;
        await delay(Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1)));
      }
    }
    throw lastError;
  }

  /**
   * Решает, можно ли начать запрос.
   *
   * В open проверяется только время cooldown. После его истечения circuit
   * переводится в half-open и первый поток получает probe lock; конкурирующие
   * потоки получают false и не создают дополнительную нагрузку на provider.
   */
  private allowRequest(serviceName: string): boolean {
    const circuit = this.getCircuit(serviceName);
    // В closed режиме каждый вызов может попасть к провайдеру.
    if (circuit.state === 'closed') return true;
    if (
      circuit.state === 'open' &&
      Date.now() - circuit.openedAt < this.openDurationMs
    )
      return false;
    // После cooldown меняем состояние до захвата probe lock.
    if (circuit.state === 'open')
      this.changeState(circuit, 'half-open', serviceName);
    if (circuit.probeInFlight) return false;
    circuit.probeInFlight = true;
    return true;
  }

  /** Фиксирует успешный ответ и завершает recovery half-open circuit. */
  private onSuccess(serviceName: string, circuit: CircuitData): void {
    if (circuit.state === 'half-open') {
      const recoverySeconds = (Date.now() - circuit.openedAt) / 1_000;
      circuitBreakerRecoverySeconds.observe(
        { service: serviceName },
        recoverySeconds,
      );
      this.changeState(circuit, 'closed', serviceName);
    }
    circuit.failures = 0;
  }

  /** Засчитывает transient failure и открывает circuit при достижении порога. */
  private onFailure(serviceName: string, circuit: CircuitData): void {
    circuit.failures += 1;
    if (
      circuit.state === 'half-open' ||
      circuit.failures >= this.failureThreshold
    ) {
      circuit.openedAt = Date.now();
      this.changeState(circuit, 'open', serviceName);
    }
  }

  /** Меняет state и публикует наблюдаемое событие перехода в Prometheus. */
  private changeState(
    circuit: CircuitData,
    next: CircuitState,
    serviceName: string,
  ): void {
    if (circuit.state === next) return;
    const previous = circuit.state;
    circuit.state = next;
    circuitBreakerStateChangesTotal.inc({
      service: serviceName,
      from: previous,
      to: next,
    });
  }

  /** Лениво создает независимое состояние для нового serviceName. */
  private getCircuit(serviceName: string): CircuitData {
    const existing = this.circuits.get(serviceName);
    if (existing) return existing;
    const created: CircuitData = {
      state: 'closed',
      failures: 0,
      openedAt: 0,
      probeInFlight: false,
    };
    this.circuits.set(serviceName, created);
    return created;
  }
}

/**
 * Определяет ошибки, для которых повтор операции не имеет смысла.
 *
 * HTTP 400–499 трактуются как permanent, так же как явный флаг permanent.
 * Ошибки timeout, сетевые сбои и HTTP 5xx остаются transient и могут открыть
 * circuit после достижения failureThreshold.
 */
export function isPermanentError(error: unknown): boolean {
  const candidate = error as {
    permanent?: unknown;
    status?: unknown;
    statusCode?: unknown;
  };
  const status = Number(candidate.status ?? candidate.statusCode);
  return candidate.permanent === true || (status >= 400 && status < 500);
}

/** Выполняет backoff между двумя попытками, не занимая event loop синхронно. */
function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
