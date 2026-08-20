import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { Pool, PoolConnection } from 'mysql2/promise';
import { MYSQL_POOL } from '../../database/connections/mysql-pool.token';
import { ListOutboxEventsQueryDto } from '../dto/list-outbox-events-query.dto';
import { OutboxEventStatus } from '../dto/outbox-event-status.dto';
import { OutboxEventRecord } from '../types/outbox-event-record.type';
import { OutboxEventRow } from '../types/outbox-event-row.type';
import { OutboxStatusCount } from '../types/outbox-status-count.type';
import { ProcessedEventReservationResult } from '../types/processed-event-reservation-result.type';
import { ProcessedEventRow } from '../types/processed-event-row.type';

type OutboxStatusCountRow = RowDataPacket & {
  status: OutboxEventStatus;
  count: number;
};

/**
 * Repository Outbox.
 *
 * Содержит SQL-запросы к таблице `outbox_events`.
 */
@Injectable()
export class OutboxRepository {
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  /**
   * Атомарно забирает пачку событий в обработку.
   *
   * `FOR UPDATE SKIP LOCKED` блокирует только выбранные строки и позволяет
   * нескольким инстансам приложения параллельно забирать разные события.
   */
  async claimDueEvents(
    limit: number,
    leaseOwner = 'outbox-worker',
    leaseDurationMs = 30_000,
  ): Promise<OutboxEventRecord[]> {
    const normalizedLimit = Number(limit);
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      const rows = await this.selectDueEventsForUpdate(
        connection,
        normalizedLimit,
      );

      if (rows.length === 0) {
        await connection.commit();
        return [];
      }

      const leaseToken = await this.markRowsAsProcessing(
        connection,
        rows.map((row) => row.id),
        leaseOwner,
        leaseDurationMs,
      );
      await connection.commit();
      return rows.map((row) => ({
        ...this.toRecord(row),
        status: OutboxEventStatus.Processing,
        leaseOwner,
        leaseToken,
        leaseExpiresAt: new Date(Date.now() + leaseDurationMs),
        fencingToken: Number(row.fencing_token) + 1,
      }));
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Возвращает список Outbox-событий с опциональной фильтрацией по статусу.
   *
   * Для пагинации используется `query()`, потому что `execute()` может падать
   * на `LIMIT/OFFSET` в server-side prepared statements.
   */
  async findAll(query: ListOutboxEventsQueryDto): Promise<OutboxEventRecord[]> {
    const limit = Number(query.limit ?? 20);
    const offset = Number(query.offset ?? 0);

    if (query.status) {
      const [rows] = await this.pool.query<OutboxEventRow[]>(
        `
          SELECT
            id,
            event_type,
            aggregate_type,
            aggregate_id,
            payload,
            status,
            attempts,
            next_retry_at,
            processed_at,
            error,
            error_code,
            error_stack,
            dead_letter_reason,
            manual_retry_reason,
            lease_owner,
            lease_token,
            lease_expires_at,
            fencing_token,
            created_at
          FROM outbox_events
          WHERE status = ?
          ORDER BY created_at DESC
          LIMIT ? OFFSET ?
        `,
        [query.status, limit, offset],
      );

      return rows.map(this.toRecord);
    }

    const [rows] = await this.pool.query<OutboxEventRow[]>(
      `
        SELECT
          id,
          event_type,
          aggregate_type,
          aggregate_id,
          payload,
          status,
          attempts,
          next_retry_at,
          processed_at,
          error,
          error_code,
          error_stack,
          dead_letter_reason,
          manual_retry_reason,
          lease_owner,
          lease_token,
          lease_expires_at,
          fencing_token,
          created_at
        FROM outbox_events
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `,
      [limit, offset],
    );

    return rows.map(this.toRecord);
  }

  /**
   * Ищет Outbox-событие по идентификатору.
   */
  async findById(id: number): Promise<OutboxEventRecord | null> {
    const [rows] = await this.pool.execute<OutboxEventRow[]>(
      `
        SELECT
          id,
          event_type,
          aggregate_type,
          aggregate_id,
          payload,
          status,
          attempts,
          next_retry_at,
          processed_at,
          error,
          error_code,
          error_stack,
          dead_letter_reason,
          manual_retry_reason,
          lease_owner,
          lease_token,
          lease_expires_at,
          fencing_token,
          created_at
        FROM outbox_events
        WHERE id = ?
        LIMIT 1
      `,
      [id],
    );

    return rows[0] ? this.toRecord(rows[0]) : null;
  }

  /**
   * Возвращает количество Outbox-событий по статусам.
   */
  async countByStatus(): Promise<OutboxStatusCount[]> {
    const [rows] = await this.pool.query<OutboxStatusCountRow[]>(
      `
        SELECT
          status,
          COUNT(*) AS count
        FROM outbox_events
        GROUP BY status
      `,
    );

    return rows.map((row) => ({
      status: row.status,
      count: Number(row.count),
    }));
  }

  /** Возвращает возраст самого старого необработанного события в секундах. */
  async oldestPendingAgeSeconds(): Promise<number> {
    const [rows] = await this.pool.query<
      Array<RowDataPacket & { age_seconds: number | null }>
    >(
      `SELECT TIMESTAMPDIFF(MICROSECOND, MIN(created_at), CURRENT_TIMESTAMP(3)) / 1000000 AS age_seconds
       FROM outbox_events WHERE status IN (?, ?)`,
      [OutboxEventStatus.Pending, OutboxEventStatus.Failed],
    );
    return Number(rows[0]?.age_seconds ?? 0);
  }

  /**
   * Сбрасывает событие в ручную повторную обработку.
   *
   * Метод очищает ошибку, дату следующей попытки и счетчик attempts,
   * но сохраняет причину ручного retry для аудита.
   */
  async retry(id: number, reason: string): Promise<OutboxEventRecord | null> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `
        UPDATE outbox_events
        SET
          status = 'pending',
          attempts = 0,
          next_retry_at = NULL,
          processed_at = NULL,
          error = NULL,
          error_code = NULL,
          error_stack = NULL,
          dead_letter_reason = NULL,
          manual_retry_reason = ?,
          lease_owner = NULL,
          lease_token = NULL,
          lease_expires_at = NULL
        WHERE id = ?
      `,
      [reason, id],
    );

    if (result.affectedRows === 0) {
      return null;
    }

    return this.findById(id);
  }

  /** Повторно ставит только dead-letter событие в pending. */
  async requeueDeadLetter(
    id: number,
    reason: string,
  ): Promise<OutboxEventRecord | null> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE outbox_events
       SET status = ?, attempts = 0, next_retry_at = NULL, processed_at = NULL,
           error = NULL, error_code = NULL, error_stack = NULL,
           dead_letter_reason = ?, manual_retry_reason = ?, lease_owner = NULL,
           lease_token = NULL, lease_expires_at = NULL
       WHERE id = ? AND status = ?`,
      [
        OutboxEventStatus.Pending,
        reason,
        reason,
        id,
        OutboxEventStatus.DeadLetter,
      ],
    );
    return result.affectedRows === 0 ? null : this.findById(id);
  }

  /**
   * Фиксирует успешную обработку события.
   */
  async markProcessed(id: number, leaseToken?: string | null): Promise<void> {
    await this.pool.execute(
      `
        UPDATE outbox_events
        SET
          status = ?,
          processed_at = CURRENT_TIMESTAMP(3),
          next_retry_at = NULL,
          error = NULL,
          error_code = NULL,
          error_stack = NULL,
          manual_retry_reason = NULL,
          lease_owner = NULL,
          lease_token = NULL,
          lease_expires_at = NULL
        WHERE id = ? AND (? IS NULL OR lease_token = ?)
      `,
      [OutboxEventStatus.Processed, id, leaseToken ?? null, leaseToken ?? null],
    );
  }

  /**
   * Фиксирует ошибку обработки и планирует следующую попытку.
   */
  async markFailed(
    id: number,
    attempts: number,
    error: string,
    nextRetryAt: Date | null,
    errorCode: string | null = null,
    errorStack: string | null = null,
    leaseToken?: string | null,
  ): Promise<void> {
    await this.pool.execute(
      `
        UPDATE outbox_events
        SET
          status = ?,
          attempts = ?,
          next_retry_at = ?,
          processed_at = NULL,
          error = ?, error_code = ?, error_stack = ?, lease_owner = NULL,
          lease_token = NULL, lease_expires_at = NULL
        WHERE id = ? AND (? IS NULL OR lease_token = ?)
      `,
      [
        OutboxEventStatus.Failed,
        attempts,
        nextRetryAt,
        error,
        errorCode,
        errorStack,
        id,
        leaseToken ?? null,
        leaseToken ?? null,
      ],
    );
  }

  /**
   * Переводит событие в dead-letter после исчерпания retry policy.
   */
  async markDeadLetter(
    id: number,
    attempts: number,
    error: string,
    errorCode: string | null = null,
    errorStack: string | null = null,
    deadLetterReason = error,
    leaseToken?: string | null,
  ): Promise<void> {
    await this.pool.execute(
      `
        UPDATE outbox_events
        SET
          status = ?,
          attempts = ?,
          next_retry_at = NULL,
          processed_at = NULL,
          error = ?, error_code = ?, error_stack = ?, dead_letter_reason = ?,
          lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL
        WHERE id = ? AND (? IS NULL OR lease_token = ?)
      `,
      [
        OutboxEventStatus.DeadLetter,
        attempts,
        error,
        errorCode,
        errorStack,
        deadLetterReason,
        id,
        leaseToken ?? null,
        leaseToken ?? null,
      ],
    );
  }

  /**
   * Резервирует idempotency key обработчика до выполнения side effects.
   *
   * Если ключ уже есть в `processed_events`, повторная генерация не запускается.
   */
  async reserveProcessedEvent(
    event: OutboxEventRecord,
    idempotencyKey: string,
  ): Promise<ProcessedEventReservationResult> {
    const [insertResult] = await this.pool.execute<ResultSetHeader>(
      `
        INSERT IGNORE INTO processed_events (
          idempotency_key,
          outbox_event_id,
          event_type,
          aggregate_type,
          aggregate_id,
          status
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        idempotencyKey,
        event.id,
        event.eventType,
        event.aggregateType,
        event.aggregateId,
        'processing',
      ],
    );

    if (insertResult.affectedRows === 1) {
      return ProcessedEventReservationResult.Reserved;
    }

    const existing = await this.findProcessedEventByKey(idempotencyKey);

    return existing?.status === 'processed'
      ? ProcessedEventReservationResult.AlreadyProcessed
      : ProcessedEventReservationResult.AlreadyProcessing;
  }

  /**
   * Помечает idempotency key обработчика успешно выполненным.
   */
  async markProcessedEvent(idempotencyKey: string): Promise<void> {
    await this.pool.execute(
      `
        UPDATE processed_events
        SET
          status = 'processed',
          processed_at = CURRENT_TIMESTAMP(3)
        WHERE idempotency_key = ?
      `,
      [idempotencyKey],
    );
  }

  /**
   * Освобождает reservation после ошибки, чтобы retry мог повторить side effect.
   */
  async releaseProcessedEventReservation(
    idempotencyKey: string,
  ): Promise<void> {
    await this.pool.execute(
      `
        DELETE FROM processed_events
        WHERE idempotency_key = ?
          AND status = 'processing'
      `,
      [idempotencyKey],
    );
  }

  /**
   * Выбирает due-события внутри транзакции и блокирует выбранные строки.
   */
  private async selectDueEventsForUpdate(
    connection: PoolConnection,
    limit: number,
  ): Promise<OutboxEventRow[]> {
    const [rows] = await connection.query<OutboxEventRow[]>(
      `
        SELECT
          id,
          event_type,
          aggregate_type,
          aggregate_id,
          payload,
          status,
          attempts,
          next_retry_at,
          processed_at,
          error,
          error_code,
          error_stack,
          dead_letter_reason,
          manual_retry_reason,
          lease_owner,
          lease_token,
          lease_expires_at,
          fencing_token,
          created_at
        FROM outbox_events
        WHERE
          (
            status = ?
            AND (next_retry_at IS NULL OR next_retry_at <= CURRENT_TIMESTAMP(3))
          )
          OR (
            status = ?
            AND next_retry_at IS NOT NULL
            AND next_retry_at <= CURRENT_TIMESTAMP(3)
          )
          OR (
            status = ?
            AND lease_expires_at IS NOT NULL
            AND lease_expires_at <= CURRENT_TIMESTAMP(3)
          )
        ORDER BY created_at ASC
        LIMIT ?
        FOR UPDATE SKIP LOCKED
      `,
      [
        OutboxEventStatus.Pending,
        OutboxEventStatus.Failed,
        OutboxEventStatus.Processing,
        limit,
      ],
    );

    return rows;
  }

  /**
   * Переводит забранные события в `processing` внутри той же транзакции claim.
   */
  private async markRowsAsProcessing(
    connection: PoolConnection,
    ids: number[],
    leaseOwner: string,
    leaseDurationMs: number,
  ): Promise<string> {
    const placeholders = ids.map(() => '?').join(', ');
    const leaseToken = randomUUID();

    await connection.query(
      `
        UPDATE outbox_events
        SET
          status = ?,
          error = NULL,
          lease_owner = ?,
          lease_token = ?,
          lease_expires_at = ?,
          fencing_token = fencing_token + 1
        WHERE id IN (${placeholders})
      `,
      [
        OutboxEventStatus.Processing,
        leaseOwner,
        leaseToken,
        new Date(Date.now() + leaseDurationMs),
        ...ids,
      ],
    );
    return leaseToken;
  }

  /**
   * Преобразует SQL-row в доменный тип и нормализует JSON payload.
   */
  private toRecord(row: OutboxEventRow): OutboxEventRecord {
    return {
      id: row.id,
      eventType: row.event_type,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      payload:
        typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
      status: row.status,
      attempts: row.attempts,
      nextRetryAt: row.next_retry_at,
      processedAt: row.processed_at,
      error: row.error,
      errorCode: row.error_code,
      errorStack: row.error_stack,
      deadLetterReason: row.dead_letter_reason,
      manualRetryReason: row.manual_retry_reason,
      leaseOwner: row.lease_owner,
      leaseToken: row.lease_token,
      leaseExpiresAt: row.lease_expires_at,
      fencingToken: Number(row.fencing_token),
      createdAt: row.created_at,
    };
  }

  /**
   * Ищет reservation по idempotency key.
   */
  private async findProcessedEventByKey(
    idempotencyKey: string,
  ): Promise<ProcessedEventRow | null> {
    const [rows] = await this.pool.execute<ProcessedEventRow[]>(
      `
        SELECT
          id,
          idempotency_key,
          outbox_event_id,
          event_type,
          aggregate_type,
          aggregate_id,
          status,
          processed_at,
          created_at
        FROM processed_events
        WHERE idempotency_key = ?
        LIMIT 1
      `,
      [idempotencyKey],
    );

    return rows[0] ?? null;
  }
}
