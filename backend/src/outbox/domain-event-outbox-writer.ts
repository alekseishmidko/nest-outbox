import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import { MYSQL_POOL } from '../database/connections/mysql-pool.token';
import { DomainEvent } from '../domain/events/domain-event';
import { toOutboxEnvelope } from './domain-event-mapper';

/** Записывает domain event в инфраструктурную таблицу Outbox. */
@Injectable()
export class DomainEventOutboxWriter {
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  async append(event: DomainEvent): Promise<void> {
    const envelope = toOutboxEnvelope(event);
    await this.pool.execute(
      `
        INSERT INTO outbox_events
          (event_type, aggregate_type, aggregate_id, payload, status, attempts)
        VALUES (?, ?, ?, ?, 'pending', 0)
      `,
      [
        envelope.eventType,
        envelope.aggregateType,
        envelope.aggregateId,
        JSON.stringify(envelope.payload),
      ],
    );
  }
}
