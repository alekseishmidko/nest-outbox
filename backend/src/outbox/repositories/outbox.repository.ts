import { Inject, Injectable } from '@nestjs/common';
import { ResultSetHeader } from 'mysql2';
import { Pool } from 'mysql2/promise';
import { MYSQL_POOL } from '../../database/connections/mysql-pool.token';
import { ListOutboxEventsQueryDto } from '../dto/list-outbox-events-query.dto';
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

  async findAll(query: ListOutboxEventsQueryDto): Promise<OutboxEventRecord[]> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    if (query.status) {
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
          WHERE status = ?
          ORDER BY created_at DESC
          LIMIT ? OFFSET ?
        `,
        [query.status, limit, offset],
      );

      return rows.map(this.toRecord);
    }

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
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `,
      [limit, offset],
    );

    return rows.map(this.toRecord);
  }

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
