import { Inject, Injectable } from '@nestjs/common';
import { ResultSetHeader } from 'mysql2';
import { Pool, PoolConnection } from 'mysql2/promise';
import { MYSQL_POOL } from '../../database/connections/mysql-pool.token';
import { InboxEventStatus } from '../dto/inbox-event-status.dto';
import { InboxEventRecord } from '../types/inbox-event-record.type';
import { InboxEventRow } from '../types/inbox-event-row.type';

/** Репозиторий Inbox с идемпотентным приемом и атомарным claim. */
@Injectable()
export class InboxRepository {
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  /** Принимает событие; повторный `eventId` возвращает существующую запись. */
  async receive(input: {
    eventId: string;
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<{ record: InboxEventRecord; created: boolean }> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT IGNORE INTO inbox_events (event_id, event_type, payload)
       VALUES (?, ?, ?)`,
      [input.eventId, input.eventType, JSON.stringify(input.payload)],
    );
    const record = await this.findByEventId(input.eventId);
    if (!record) throw new Error(`Inbox event ${input.eventId} was not found`);
    return { record, created: result.affectedRows === 1 };
  }

  /** Возвращает событие по внешнему идентификатору. */
  async findByEventId(eventId: string): Promise<InboxEventRecord | null> {
    const [rows] = await this.pool.execute<InboxEventRow[]>(
      `SELECT id, event_id, event_type, payload, status, attempts,
              next_retry_at, processed_at, last_error, created_at, updated_at
       FROM inbox_events WHERE event_id = ? LIMIT 1`,
      [eventId],
    );
    return rows[0] ? this.toRecord(rows[0]) : null;
  }

  /** Атомарно переводит due-события из received/failed в processing. */
  async claimDueEvents(limit: number): Promise<InboxEventRecord[]> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const rows = await this.selectDue(connection, Number(limit));
      if (rows.length === 0) {
        await connection.commit();
        return [];
      }
      const ids = rows.map((row) => row.id);
      await connection.query(
        `UPDATE inbox_events SET status = ?, attempts = attempts + 1
         WHERE id IN (${ids.map(() => '?').join(', ')})`,
        [InboxEventStatus.Processing, ...ids],
      );
      await connection.commit();
      return rows.map((row) => ({
        ...this.toRecord(row),
        status: InboxEventStatus.Processing,
        attempts: row.attempts + 1,
      }));
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /** Фиксирует успешную обработку события. */
  async markProcessed(id: number): Promise<void> {
    await this.pool.execute(
      `UPDATE inbox_events SET status = ?, processed_at = CURRENT_TIMESTAMP(3),
       next_retry_at = NULL, last_error = NULL WHERE id = ?`,
      [InboxEventStatus.Processed, id],
    );
  }

  /** Планирует повторную обработку после ошибки. */
  async markFailed(
    id: number,
    error: string,
    nextRetryAt: Date,
  ): Promise<void> {
    await this.pool.execute(
      `UPDATE inbox_events SET status = ?, last_error = ?, next_retry_at = ?,
       processed_at = NULL WHERE id = ?`,
      [InboxEventStatus.Failed, error, nextRetryAt, id],
    );
  }

  /** Переводит событие в dead-letter после исчерпания попыток. */
  async markDeadLetter(id: number, error: string): Promise<void> {
    await this.pool.execute(
      `UPDATE inbox_events SET status = ?, last_error = ?, next_retry_at = NULL,
       processed_at = NULL WHERE id = ?`,
      [InboxEventStatus.DeadLetter, error, id],
    );
  }

  private async selectDue(
    connection: PoolConnection,
    limit: number,
  ): Promise<InboxEventRow[]> {
    const [rows] = await connection.query<InboxEventRow[]>(
      `SELECT id, event_id, event_type, payload, status, attempts,
              next_retry_at, processed_at, last_error, created_at, updated_at
       FROM inbox_events
       WHERE (status = ? OR (status = ? AND next_retry_at <= CURRENT_TIMESTAMP(3)))
       ORDER BY created_at ASC LIMIT ? FOR UPDATE SKIP LOCKED`,
      [InboxEventStatus.Received, InboxEventStatus.Failed, limit],
    );
    return rows;
  }

  private toRecord(row: InboxEventRow): InboxEventRecord {
    return {
      id: row.id,
      eventId: row.event_id,
      eventType: row.event_type,
      payload:
        typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
      status: row.status,
      attempts: Number(row.attempts),
      nextRetryAt: row.next_retry_at,
      processedAt: row.processed_at,
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
