import { Inject, Injectable } from '@nestjs/common';
import { RowDataPacket } from 'mysql2';
import { Pool, PoolConnection } from 'mysql2/promise';
import { MYSQL_POOL } from '../../database/connections/mysql-pool.token';
import { OrderStatus } from '../dto/order-status.dto';
import { OrderStatusChanged } from '../../domain/events/order-status-changed.event';
import { toOutboxEnvelope } from '../../outbox/domain-event-mapper';

export type OrderSagaStage = 'avatar' | 'qr';
export type OrderSagaState = {
  completedStages: OrderSagaStage[];
  status: 'running' | 'failed' | 'completed';
};

type SagaRow = RowDataPacket & {
  status: OrderSagaState['status'];
  completed_stages: string | OrderSagaStage[];
};

@Injectable()
export class OrderSagaRepository {
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  async startOrResume(orderId: number): Promise<OrderSagaState> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<SagaRow[]>(
        'SELECT status, completed_stages FROM order_sagas WHERE order_id = ? FOR UPDATE',
        [orderId],
      );
      const row = rows[0];
      if (!row) {
        await connection.execute(
          `INSERT INTO order_sagas (order_id, status, current_stage, completed_stages)
           VALUES (?, 'running', 'avatar', '[]')`,
          [orderId],
        );
        await connection.commit();
        return { status: 'running', completedStages: [] };
      }

      const completedStages = this.parseStages(row.completed_stages);
      if (row.status === 'failed') {
        const [orders] = await connection.execute<
          (RowDataPacket & { status: OrderStatus; version: number })[]
        >(
          'SELECT status, version FROM orders WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
          [orderId],
        );
        const order = orders[0];
        if (order?.status === OrderStatus.Failed) {
          await connection.execute(
            'UPDATE orders SET status = ?, version = version + 1 WHERE id = ?',
            [OrderStatus.Pending, orderId],
          );
          await this.appendStatusChanged(
            connection,
            new OrderStatusChanged(
              orderId,
              OrderStatus.Failed,
              OrderStatus.Pending,
              order.version + 1,
            ).toDomainEvent(),
          );
        }
        await connection.execute(
          `UPDATE order_sagas SET status = 'running', last_error = NULL WHERE order_id = ?`,
          [orderId],
        );
      }
      await connection.commit();
      return { status: 'running', completedStages };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async markStageCompleted(
    orderId: number,
    stage: OrderSagaStage,
  ): Promise<void> {
    const state = await this.find(orderId);
    const completedStages = state.completedStages.includes(stage)
      ? state.completedStages
      : [...state.completedStages, stage];
    const nextStage = completedStages.includes('qr') ? 'completed' : 'qr';
    await this.pool.execute(
      `UPDATE order_sagas
       SET completed_stages = ?, current_stage = ?, updated_at = CURRENT_TIMESTAMP(3)
       WHERE order_id = ?`,
      [JSON.stringify(completedStages), nextStage, orderId],
    );
  }

  async complete(orderId: number): Promise<void> {
    await this.pool.execute(
      `UPDATE order_sagas SET status = 'completed', current_stage = 'completed', last_error = NULL
       WHERE order_id = ?`,
      [orderId],
    );
  }

  /** Компенсация переводит заказ в failed; retry вернет его в pending. */
  async compensate(orderId: number, reason: string): Promise<void> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `UPDATE order_sagas SET status = 'failed', last_error = ? WHERE order_id = ?`,
        [reason.slice(0, 4000), orderId],
      );
      const [orders] = await connection.execute<
        (RowDataPacket & { status: OrderStatus; version: number })[]
      >(
        'SELECT status, version FROM orders WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
        [orderId],
      );
      const order = orders[0];
      if (
        order &&
        order.status !== OrderStatus.Failed &&
        order.status !== OrderStatus.Cancelled
      ) {
        await connection.execute(
          'UPDATE orders SET status = ?, version = version + 1 WHERE id = ?',
          [OrderStatus.Failed, orderId],
        );
        await this.appendStatusChanged(
          connection,
          new OrderStatusChanged(
            orderId,
            order.status,
            OrderStatus.Failed,
            order.version + 1,
          ).toDomainEvent(),
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  private async find(orderId: number): Promise<OrderSagaState> {
    const [rows] = await this.pool.execute<SagaRow[]>(
      'SELECT status, completed_stages FROM order_sagas WHERE order_id = ? LIMIT 1',
      [orderId],
    );
    if (!rows[0]) throw new Error(`Order saga ${orderId} was not found`);
    return {
      status: rows[0].status,
      completedStages: this.parseStages(rows[0].completed_stages),
    };
  }

  private parseStages(value: string | OrderSagaStage[]): OrderSagaStage[] {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed)
      ? parsed.filter(
          (stage): stage is OrderSagaStage =>
            stage === 'avatar' || stage === 'qr',
        )
      : [];
  }

  private async appendStatusChanged(
    connection: PoolConnection,
    event: ReturnType<OrderStatusChanged['toDomainEvent']>,
  ): Promise<void> {
    const envelope = toOutboxEnvelope(event);
    await connection.execute(
      `INSERT INTO outbox_events
       (event_type, aggregate_type, aggregate_id, payload, status, attempts)
       VALUES (?, ?, ?, ?, 'pending', 0)`,
      [
        envelope.eventType,
        envelope.aggregateType,
        envelope.aggregateId,
        JSON.stringify(envelope.payload),
      ],
    );
  }
}
