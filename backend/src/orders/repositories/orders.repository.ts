import { Inject, Injectable } from '@nestjs/common';
import { ResultSetHeader } from 'mysql2';
import { Pool } from 'mysql2/promise';
import { MYSQL_POOL } from '../../database/connections/mysql-pool.token';
import { CreateOrderDto } from '../dto/create-order.dto';
import { ListOrdersQueryDto } from '../dto/list-orders-query.dto';
import { OrderStatus } from '../dto/order-status.dto';
import { OrderRecord } from '../types/order-record.type';
import { OrderRow } from '../types/order-row.type';
import { SqlValue } from '../types/sql-value.type';

/**
 * Repository заказов.
 *
 * Содержит SQL-запросы к `orders` и транзакционный сценарий записи Outbox-события.
 */
@Injectable()
export class OrdersRepository {
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  async createWithOutbox(dto: CreateOrderDto): Promise<OrderRecord> {
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      const [orderResult] = await connection.execute<ResultSetHeader>(
        `
          INSERT INTO orders (
            user_id,
            map_id,
            status,
            total_amount
          ) VALUES (?, ?, ?, ?)
        `,
        [dto.userId, dto.mapId, OrderStatus.Pending, dto.totalAmount],
      );

      const orderId = orderResult.insertId;

      await connection.execute(
        `
          INSERT INTO outbox_events (
            event_type,
            aggregate_type,
            aggregate_id,
            payload,
            status,
            attempts
          ) VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
          'order.created',
          'order',
          orderId,
          JSON.stringify({
            orderId,
            userId: dto.userId,
            mapId: dto.mapId,
            totalAmount: dto.totalAmount,
          }),
          'pending',
          0,
        ],
      );

      await connection.commit();

      return this.findByIdOrThrow(orderId);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async findAll(query: ListOrdersQueryDto): Promise<OrderRecord[]> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    if (query.status) {
      const [rows] = await this.pool.execute<OrderRow[]>(
        `
          SELECT
            id,
            user_id,
            map_id,
            status,
            total_amount,
            created_at,
            updated_at
          FROM orders
          WHERE status = ?
          ORDER BY created_at DESC
          LIMIT ? OFFSET ?
        `,
        [query.status, limit, offset],
      );

      return rows.map(this.toRecord);
    }

    const [rows] = await this.pool.execute<OrderRow[]>(
      `
        SELECT
          id,
          user_id,
          map_id,
          status,
          total_amount,
          created_at,
          updated_at
        FROM orders
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `,
      [limit, offset],
    );

    return rows.map(this.toRecord);
  }

  async findById(id: number): Promise<OrderRecord | null> {
    const [rows] = await this.pool.execute<OrderRow[]>(
      `
        SELECT
          id,
          user_id,
          map_id,
          status,
          total_amount,
          created_at,
          updated_at
        FROM orders
        WHERE id = ?
        LIMIT 1
      `,
      [id],
    );

    return rows[0] ? this.toRecord(rows[0]) : null;
  }

  async findByUserId(
    userId: number,
    query: ListOrdersQueryDto,
  ): Promise<OrderRecord[]> {
    return this.findByForeignKey('user_id', userId, query);
  }

  async findByMapId(
    mapId: number,
    query: ListOrdersQueryDto,
  ): Promise<OrderRecord[]> {
    return this.findByForeignKey('map_id', mapId, query);
  }

  async updateStatus(
    id: number,
    status: OrderStatus,
  ): Promise<OrderRecord | null> {
    await this.pool.execute('UPDATE orders SET status = ? WHERE id = ?', [
      status,
      id,
    ]);

    return this.findById(id);
  }

  private async findByForeignKey(
    columnName: 'user_id' | 'map_id',
    value: number,
    query: ListOrdersQueryDto,
  ): Promise<OrderRecord[]> {
    const where = [`${columnName} = ?`];
    const values: SqlValue[] = [value];

    if (query.status) {
      where.push('status = ?');
      values.push(query.status);
    }

    values.push(query.limit ?? 20, query.offset ?? 0);

    const [rows] = await this.pool.execute<OrderRow[]>(
      `
        SELECT
          id,
          user_id,
          map_id,
          status,
          total_amount,
          created_at,
          updated_at
        FROM orders
        WHERE ${where.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `,
      values,
    );

    return rows.map(this.toRecord);
  }

  private async findByIdOrThrow(id: number): Promise<OrderRecord> {
    const order = await this.findById(id);

    if (!order) {
      throw new Error(`Order ${id} was not found after insert`);
    }

    return order;
  }

  private toRecord(row: OrderRow): OrderRecord {
    return {
      id: row.id,
      userId: row.user_id,
      mapId: row.map_id,
      status: row.status,
      totalAmount: row.total_amount,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
