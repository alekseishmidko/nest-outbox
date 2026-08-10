import { OutboxEventStatus } from '../dto/outbox-event-status.dto';
import { MetricsService } from '../../metrics/services/metrics.service';
import { OutboxRepository } from '../repositories/outbox.repository';
import { OutboxEventRecord } from '../types/outbox-event-record.type';
import { OutboxPublisher } from './outbox-publisher';

jest.mock('../services/outbox.service', () => ({
  OutboxService: class OutboxService {},
}));

type OutboxServiceMock = {
  handleEvent: jest.Mock<Promise<void>, [OutboxEventRecord]>;
};

type MetricsServiceMock = Pick<
  jest.Mocked<MetricsService>,
  'observeOutboxProcessed' | 'observeOutboxFailed' | 'setOutboxStatusCount'
>;

function createEvent(
  overrides: Partial<OutboxEventRecord> = {},
): OutboxEventRecord {
  return {
    id: 1,
    eventType: 'order.created',
    aggregateType: 'order',
    aggregateId: 10,
    payload: {
      orderId: 10,
      userId: 20,
      mapId: 30,
    },
    status: OutboxEventStatus.Processing,
    attempts: 0,
    nextRetryAt: null,
    processedAt: null,
    error: null,
    manualRetryReason: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('OutboxPublisher', () => {
  let repository: jest.Mocked<
    Pick<
      OutboxRepository,
      | 'claimDueEvents'
      | 'markProcessed'
      | 'markFailed'
      | 'markDeadLetter'
      | 'countByStatus'
    >
  >;
  let service: OutboxServiceMock;
  let metricsService: MetricsServiceMock;

  beforeEach(() => {
    process.env.OUTBOX_POLL_INTERVAL_MS = '10000';
    process.env.OUTBOX_BATCH_SIZE = '10';
    process.env.OUTBOX_MAX_ATTEMPTS = '3';
    process.env.OUTBOX_RETRY_BASE_DELAY_MS = '1000';
    process.env.OUTBOX_RETRY_MAX_DELAY_MS = '60000';
    process.env.OUTBOX_RETRY_JITTER_MS = '0';
    process.env.OUTBOX_SHUTDOWN_TIMEOUT_MS = '1000';

    repository = {
      claimDueEvents: jest.fn(),
      markProcessed: jest.fn(),
      markFailed: jest.fn(),
      markDeadLetter: jest.fn(),
      countByStatus: jest.fn().mockResolvedValue([]),
    };
    service = {
      handleEvent: jest.fn(),
    };
    metricsService = {
      observeOutboxProcessed: jest.fn(),
      observeOutboxFailed: jest.fn(),
      setOutboxStatusCount: jest.fn(),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    delete process.env.OUTBOX_POLL_INTERVAL_MS;
    delete process.env.OUTBOX_BATCH_SIZE;
    delete process.env.OUTBOX_MAX_ATTEMPTS;
    delete process.env.OUTBOX_RETRY_BASE_DELAY_MS;
    delete process.env.OUTBOX_RETRY_MAX_DELAY_MS;
    delete process.env.OUTBOX_RETRY_JITTER_MS;
    delete process.env.OUTBOX_SHUTDOWN_TIMEOUT_MS;
  });

  function createPublisher(): OutboxPublisher {
    return new OutboxPublisher(
      repository as unknown as OutboxRepository,
      service as never,
      metricsService as unknown as MetricsService,
    );
  }

  it('успешно обрабатывает событие и переводит его в processed', async () => {
    const event = createEvent();
    const publisher = createPublisher();

    repository.claimDueEvents.mockResolvedValue([event]);
    service.handleEvent.mockResolvedValue();
    repository.markProcessed.mockResolvedValue();

    const result = await publisher.processDueBatch();

    expect(repository.claimDueEvents).toHaveBeenCalledWith(10);
    expect(service.handleEvent).toHaveBeenCalledWith(event);
    expect(repository.markProcessed).toHaveBeenCalledWith(event.id);
    expect(metricsService.observeOutboxProcessed).toHaveBeenCalledWith(
      event.eventType,
      expect.any(Number),
    );
    expect(repository.markFailed).not.toHaveBeenCalled();
    expect(result).toEqual({
      claimed: 1,
      processed: 1,
      failed: 0,
    });
  });

  it('фиксирует ошибку, увеличивает attempts и планирует retry', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const event = createEvent({ attempts: 1 });
    const publisher = createPublisher();

    repository.claimDueEvents.mockResolvedValue([event]);
    service.handleEvent.mockRejectedValue(new Error('media failed'));
    repository.markFailed.mockResolvedValue();

    const result = await publisher.processDueBatch();

    expect(repository.markFailed).toHaveBeenCalledWith(
      event.id,
      2,
      'media failed',
      new Date('2026-01-01T00:00:02.000Z'),
    );
    expect(metricsService.observeOutboxFailed).toHaveBeenCalledWith(
      event.eventType,
      expect.any(Number),
    );
    expect(repository.markProcessed).not.toHaveBeenCalled();
    expect(result).toEqual({
      claimed: 1,
      processed: 0,
      failed: 1,
    });
  });

  it('переводит событие в dead_letter после исчерпания attempts', async () => {
    const event = createEvent({ attempts: 2 });
    const publisher = createPublisher();

    repository.claimDueEvents.mockResolvedValue([event]);
    service.handleEvent.mockRejectedValue(new Error('final failure'));
    repository.markDeadLetter.mockResolvedValue();

    await publisher.processDueBatch();

    expect(repository.markDeadLetter).toHaveBeenCalledWith(
      event.id,
      3,
      'final failure',
    );
    expect(repository.markFailed).not.toHaveBeenCalled();
  });

  it('обрабатывает повторную попытку события из failed-статуса', async () => {
    const event = createEvent({
      status: OutboxEventStatus.Processing,
      attempts: 1,
      error: null,
    });
    const publisher = createPublisher();

    repository.claimDueEvents.mockResolvedValue([event]);
    service.handleEvent.mockResolvedValue();
    repository.markProcessed.mockResolvedValue();

    const result = await publisher.processDueBatch();

    expect(service.handleEvent).toHaveBeenCalledWith(event);
    expect(repository.markProcessed).toHaveBeenCalledWith(event.id);
    expect(result.processed).toBe(1);
  });

  it('не запускает второй tick, пока первый еще выполняется', async () => {
    let resolveClaim: (events: OutboxEventRecord[]) => void;
    const event = createEvent();
    const publisher = createPublisher();
    const claimPromise = new Promise<OutboxEventRecord[]>((resolve) => {
      resolveClaim = resolve;
    });

    repository.claimDueEvents.mockReturnValue(claimPromise);
    service.handleEvent.mockResolvedValue();
    repository.markProcessed.mockResolvedValue();

    const firstTick = publisher.processDueBatch();
    const secondTick = await publisher.processDueBatch();

    expect(secondTick).toEqual({
      claimed: 0,
      processed: 0,
      failed: 0,
    });
    expect(repository.claimDueEvents).toHaveBeenCalledTimes(1);

    resolveClaim!([event]);
    await firstTick;
  });

  it('не пробрасывает ошибку claimDueEvents наружу', async () => {
    const publisher = createPublisher();

    repository.claimDueEvents.mockRejectedValue(
      new Error('outbox_events table does not exist'),
    );

    const result = await publisher.processDueBatch();

    expect(result).toEqual({
      claimed: 0,
      processed: 0,
      failed: 0,
    });
    expect(service.handleEvent).not.toHaveBeenCalled();
    expect(repository.markProcessed).not.toHaveBeenCalled();
    expect(repository.markFailed).not.toHaveBeenCalled();
  });

  it('ждет завершения текущего tick при graceful shutdown', async () => {
    let resolveClaim: (events: OutboxEventRecord[]) => void;
    const event = createEvent();
    const publisher = createPublisher();
    const claimPromise = new Promise<OutboxEventRecord[]>((resolve) => {
      resolveClaim = resolve;
    });

    repository.claimDueEvents.mockReturnValue(claimPromise);
    service.handleEvent.mockResolvedValue();
    repository.markProcessed.mockResolvedValue();

    const tickPromise = publisher.processDueBatch();
    const destroyPromise = publisher.onModuleDestroy();

    resolveClaim!([event]);
    await tickPromise;
    await destroyPromise;

    expect(repository.markProcessed).toHaveBeenCalledWith(event.id);
  });
});
