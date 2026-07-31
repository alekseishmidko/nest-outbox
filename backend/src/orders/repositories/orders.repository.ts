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

  /**
   * Создает заказ и Outbox-событие `order.created` в одной транзакции.
   *
   * Если вставка события падает, транзакция откатывается и заказ не сохраняется.
   */
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

  /**
   * Возвращает список заказов с опциональной фильтрацией по статусу.
   *
   * Для запросов с `LIMIT/OFFSET` используется `query()`, чтобы избежать
   * проблем MySQL native prepared statements с параметрами пагинации.
   */
  async findAll(query: ListOrdersQueryDto): Promise<OrderRecord[]> {
    const limit = Number(query.limit ?? 20);
    const offset = Number(query.offset ?? 0);

    if (query.status) {
      const [rows] = await this.pool.query<OrderRow[]>(
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

    const [rows] = await this.pool.query<OrderRow[]>(
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

  /**
   * Ищет заказ по идентификатору.
   */
  async findById(id: number): Promise<OrderRecord | null> {
    const [rows] = await this.pool.query<OrderRow[]>(
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

  /**
   * Возвращает заказы конкретного пользователя.
   */
  async findByUserId(
    userId: number,
    query: ListOrdersQueryDto,
  ): Promise<OrderRecord[]> {
    return this.findByForeignKey('user_id', userId, query);
  }

  /**
   * Возвращает заказы, связанные с конкретной картой.
   */
  async findByMapId(
    mapId: number,
    query: ListOrdersQueryDto,
  ): Promise<OrderRecord[]> {
    return this.findByForeignKey('map_id', mapId, query);
  }

  /**
   * Обновляет статус заказа и возвращает актуальную запись.
   */
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

  /**
   * Общий helper для выборки заказов по внешнему ключу.
   *
   * Имя колонки ограничено union-типом, поэтому пользовательский ввод не может
   * попасть в SQL как имя поля.
   */
  private async findByForeignKey(
    columnName: 'user_id' | 'map_id',
    value: number,
    query: ListOrdersQueryDto,
  ): Promise<OrderRecord[]> {
    const limit = Number(query.limit ?? 20);
    const offset = Number(query.offset ?? 0);
    const where = [`${columnName} = ?`];
    const values: SqlValue[] = [Number(value)];

    if (query.status) {
      where.push('status = ?');
      values.push(query.status);
    }

    values.push(limit, offset);

    const [rows] = await this.pool.query<OrderRow[]>(
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

  /**
   * Возвращает созданный заказ или падает, если insert не дал читаемой записи.
   */
  private async findByIdOrThrow(id: number): Promise<OrderRecord> {
    const order = await this.findById(id);

    if (!order) {
      throw new Error(`Order ${id} was not found after insert`);
    }

    return order;
  }

  /**
   * Преобразует snake_case строку MySQL в camelCase доменный тип.
   */
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
