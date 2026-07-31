import { Inject, Injectable } from '@nestjs/common';
import { ResultSetHeader } from 'mysql2';
import { Pool, PoolConnection } from 'mysql2/promise';
import { MYSQL_POOL } from '../../database/connections/mysql-pool.token';
import { ListOutboxEventsQueryDto } from '../dto/list-outbox-events-query.dto';
import { OutboxEventStatus } from '../dto/outbox-event-status.dto';
import { OutboxEventRecord } from '../types/outbox-event-record.type';
import { OutboxEventRow } from '../types/outbox-event-row.type';

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
  async claimDueEvents(limit: number): Promise<OutboxEventRecord[]> {
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

      await this.markRowsAsProcessing(
        connection,
        rows.map((row) => row.id),
      );
      await connection.commit();

      return rows.map((row) => ({
        ...this.toRecord(row),
        status: OutboxEventStatus.Processing,
        error: null,
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
   * Сбрасывает событие в ручную повторную обработку.
   *
   * Метод очищает ошибку, дату следующей попытки и счетчик attempts.
   */
  async retry(id: number): Promise<OutboxEventRecord | null> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `
        UPDATE outbox_events
        SET
          status = 'pending',
          attempts = 0,
          next_retry_at = NULL,
          processed_at = NULL,
          error = NULL
        WHERE id = ?
      `,
      [id],
    );

    if (result.affectedRows === 0) {
      return null;
    }

    return this.findById(id);
  }

  /**
   * Фиксирует успешную обработку события.
   */
  async markProcessed(id: number): Promise<void> {
    await this.pool.execute(
      `
        UPDATE outbox_events
        SET
          status = ?,
          processed_at = CURRENT_TIMESTAMP(3),
          next_retry_at = NULL,
          error = NULL
        WHERE id = ?
      `,
      [OutboxEventStatus.Processed, id],
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
  ): Promise<void> {
    await this.pool.execute(
      `
        UPDATE outbox_events
        SET
          status = ?,
          attempts = ?,
          next_retry_at = ?,
          processed_at = NULL,
          error = ?
        WHERE id = ?
      `,
      [OutboxEventStatus.Failed, attempts, nextRetryAt, error, id],
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
        ORDER BY created_at ASC
        LIMIT ?
        FOR UPDATE SKIP LOCKED
      `,
      [OutboxEventStatus.Pending, OutboxEventStatus.Failed, limit],
    );

    return rows;
  }

  /**
   * Переводит забранные события в `processing` внутри той же транзакции claim.
   */
  private async markRowsAsProcessing(
    connection: PoolConnection,
    ids: number[],
  ): Promise<void> {
    const placeholders = ids.map(() => '?').join(', ');

    await connection.query(
      `
        UPDATE outbox_events
        SET
          status = ?,
          error = NULL
        WHERE id IN (${placeholders})
      `,
      [OutboxEventStatus.Processing, ...ids],
    );
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
      createdAt: row.created_at,
    };
  }
}
