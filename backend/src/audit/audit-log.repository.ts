import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolConnection } from 'mysql2/promise';
import { MYSQL_POOL } from '../database/connections/mysql-pool.token';
import { getObservabilityContext } from '../common/observability/observability-context';

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'restore'
  | 'status_change'
  | 'ownership_change'
  | 'role_change';

export type AuditInput = {
  actorUserId?: number | null;
  action: AuditAction;
  entityType: 'user' | 'map' | 'order' | 'role';
  entityId: number;
  before?: unknown;
  after?: unknown;
};

@Injectable()
export class AuditLogRepository {
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  async append(input: AuditInput, connection?: PoolConnection): Promise<void> {
    const executor = connection ?? this.pool;
    await executor.execute(
      `
        INSERT INTO audit_log
          (actor_user_id, action, entity_type, entity_id, before_json, after_json, request_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        input.actorUserId ?? null,
        input.action,
        input.entityType,
        input.entityId,
        input.before === undefined ? null : JSON.stringify(input.before),
        input.after === undefined ? null : JSON.stringify(input.after),
        getObservabilityContext().requestId ?? null,
      ],
    );
  }
}
