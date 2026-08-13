import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { ResultSetHeader } from 'mysql2';
import { Pool, PoolConnection } from 'mysql2/promise';
import { MYSQL_POOL } from '../../database/connections/mysql-pool.token';
import { getObservabilityContext } from '../../common/observability/observability-context';
import { isMysqlDeadlockError } from '../../common/utils/mysql-error.util';
import { CreateOrderDto } from '../dto/create-order.dto';
import { ListOrdersQueryDto } from '../dto/list-orders-query.dto';
import { OrderStatus } from '../dto/order-status.dto';
import {
  IdempotencyKeyConflictError,
  IdempotencyKeyInProgressError,
} from '../types/idempotency-error.type';
import { IdempotencyKeyRow } from '../types/idempotency-key-row.type';
import { IdempotencyKeyStatus } from '../types/idempotency-key-status.type';
import { OrderOverviewRecord } from '../types/order-overview-record.type';
import { OrderOverviewRow } from '../types/order-overview-row.type';
import { OrderRecord } from '../types/order-record.type';
import { OrderRow } from '../types/order-row.type';
import { OptimisticLockConflictError } from '../types/optimistic-lock-conflict.error';
import { SqlValue } from '../types/sql-value.type';

/**
 * Repository заказов.
 *
 * Содержит SQL-запросы к `orders` и транзакционный сценарий записи Outbox-события.
 */
@Injectable()
export class OrdersRepository {
  private readonly logger = new Logger(OrdersRepository.name);
  private readonly transactionMaxAttempts = 3;
  private readonly transactionRetryBaseDelayMs = 50;

  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  /**
   * Создает заказ и Outbox-событие `order.created` в одной транзакции.
   *
   * Если вставка события падает, транзакция откатывается и заказ не сохраняется.
   */
  async createWithOutbox(
    dto: CreateOrderDto,
    idempotencyKey?: string,
  ): Promise<OrderRecord> {
    const transactionId = randomUUID();

    for (let attempt = 1; attempt <= this.transactionMaxAttempts; attempt++) {
      try {
        const result = await this.createWithOutboxAttempt(dto, idempotencyKey);
        this.logTransaction('success', transactionId, attempt);
        return result;
      } catch (error) {
        const retryable = isMysqlDeadlockError(error);
        const finalAttempt = attempt === this.transactionMaxAttempts;

        this.logTransaction(
          retryable && !finalAttempt ? 'retrying' : 'failed',
          transactionId,
          attempt,
          error,
        );

        if (!retryable || finalAttempt) {
          throw error;
        }

        await this.delay(this.transactionRetryBaseDelayMs * 2 ** (attempt - 1));
      }
    }

    throw new Error('Transaction retry loop finished unexpectedly');
  }

  /** Выполняет одну попытку транзакции создания заказа. */
  private async createWithOutboxAttempt(
    dto: CreateOrderDto,
    idempotencyKey?: string,
  ): Promise<OrderRecord> {
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      if (idempotencyKey) {
        const idempotencyResult = await this.resolveIdempotencyKey(
          connection,
          idempotencyKey,
          dto,
        );

        if (idempotencyResult) {
          await connection.commit();
          return idempotencyResult;
        }
      }

      const order = await this.insertOrderAndOutbox(connection, dto);

      if (idempotencyKey) {
        await this.completeIdempotencyKey(connection, idempotencyKey, order);
      }

      await connection.commit();

      return order;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  private logTransaction(
    outcome: 'success' | 'retrying' | 'failed',
    transactionId: string,
    attempt: number,
    error?: unknown,
  ): void {
    const mysqlError = error as { code?: string } | undefined;
    const details = {
      transactionId,
      requestId: getObservabilityContext().requestId ?? null,
      attempt,
      errorCode: mysqlError?.code ?? null,
      outcome,
    };

    if (outcome === 'success') {
      this.logger.log(details, 'Order transaction completed');
    } else if (outcome === 'retrying') {
      this.logger.warn(details, 'Order transaction deadlock; retry scheduled');
    } else {
      this.logger.error(details, 'Order transaction failed');
    }
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  /**
   * Проверяет ключ идемпотентности внутри транзакции.
   *
   * Если ключ новый, создает запись `processing` и возвращает `null`, чтобы
   * основной сценарий продолжил создание заказа. Если ключ уже завершен,
   * возвращает ранее сохраненный response.
   */
  private async resolveIdempotencyKey(
    connection: PoolConnection,
    idempotencyKey: string,
    dto: CreateOrderDto,
  ): Promise<OrderRecord | null> {
    const requestHash = this.createRequestHash(dto);
    const [insertResult] = await connection.execute<ResultSetHeader>(
      `
        INSERT IGNORE INTO idempotency_keys (
          idempotency_key,
          request_hash,
          status
        ) VALUES (?, ?, ?)
      `,
      [idempotencyKey, requestHash, IdempotencyKeyStatus.Processing],
    );

    if (insertResult.affectedRows === 1) {
      return null;
    }

    const row = await this.findIdempotencyKeyForUpdate(
      connection,
      idempotencyKey,
    );

    if (!row || row.request_hash !== requestHash) {
      throw new IdempotencyKeyConflictError();
    }

    if (row.status !== IdempotencyKeyStatus.Completed || !row.response_body) {
      throw new IdempotencyKeyInProgressError();
    }

    return this.toOrderRecordFromStoredResponse(row.response_body);
  }

  /**
   * Создает заказ и Outbox-событие `order.created`.
   */
  private async insertOrderAndOutbox(
    connection: PoolConnection,
    dto: CreateOrderDto,
  ): Promise<OrderRecord> {
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

    return this.findByIdOrThrow(connection, orderId);
  }

  /**
   * Помечает ключ идемпотентности завершенным и сохраняет response.
   */
  private async completeIdempotencyKey(
    connection: PoolConnection,
    idempotencyKey: string,
    order: OrderRecord,
  ): Promise<void> {
    await connection.execute(
      `
        UPDATE idempotency_keys
        SET
          status = ?,
          response_status_code = ?,
          response_body = ?
        WHERE idempotency_key = ?
      `,
      [
        IdempotencyKeyStatus.Completed,
        201,
        JSON.stringify(order),
        idempotencyKey,
      ],
    );
  }

  /**
   * Блокирует строку ключа идемпотентности до конца текущей транзакции.
   */
  private async findIdempotencyKeyForUpdate(
    connection: PoolConnection,
    idempotencyKey: string,
  ): Promise<IdempotencyKeyRow | null> {
    const [rows] = await connection.query<IdempotencyKeyRow[]>(
      `
        SELECT
          id,
          idempotency_key,
          request_hash,
          status,
          response_status_code,
          response_body,
          created_at,
          updated_at
        FROM idempotency_keys
        WHERE idempotency_key = ?
        LIMIT 1
        FOR UPDATE
      `,
      [idempotencyKey],
    );

    return rows[0] ?? null;
  }

  /**
   * Создает hash нормализованного тела создания заказа.
   */
  private createRequestHash(dto: CreateOrderDto): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          userId: dto.userId,
          mapId: dto.mapId,
          totalAmount: dto.totalAmount,
        }),
      )
      .digest('hex');
  }

  /**
   * Восстанавливает OrderRecord из JSON, сохраненного для повторного запроса.
   */
  private toOrderRecordFromStoredResponse(responseBody: unknown): OrderRecord {
    const parsed =
      typeof responseBody === 'string'
        ? JSON.parse(responseBody)
        : responseBody instanceof Buffer
          ? JSON.parse(responseBody.toString('utf8'))
          : responseBody;
    const record = parsed as Omit<OrderRecord, 'createdAt' | 'updatedAt'> & {
      createdAt: string;
      updatedAt: string;
    };

    return {
      ...record,
      createdAt: new Date(record.createdAt),
      updatedAt: new Date(record.updatedAt),
    };
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
            version,
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
          version,
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
   * Возвращает отчетный список заказов с данными пользователя и карты.
   *
   * Этот запрос нужен для тренировки JOIN, анализа `EXPLAIN ANALYZE` и
   * нагрузочного тестирования чтения связанных данных.
   */
  async findOverview(
    query: ListOrdersQueryDto,
  ): Promise<OrderOverviewRecord[]> {
    const limit = Number(query.limit ?? 20);
    const offset = Number(query.offset ?? 0);
    const values: SqlValue[] = [];
    const where: string[] = [];

    if (query.status) {
      where.push('o.status = ?');
      values.push(query.status);
    }

    values.push(limit, offset);

    const [rows] = await this.pool.query<OrderOverviewRow[]>(
      `
        SELECT
          o.id AS order_id,
          o.status,
          o.total_amount,
          o.created_at,
          u.id AS user_id,
          u.email AS user_email,
          u.name AS user_name,
          m.id AS map_id,
          m.title AS map_title,
          m.latitude,
          m.longitude
        FROM orders o
        JOIN users u ON u.id = o.user_id
        JOIN maps m ON m.id = o.map_id
        ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY o.created_at DESC
        LIMIT ? OFFSET ?
      `,
      values,
    );

    return rows.map(this.toOverviewRecord);
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
          version,
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
    expectedVersion: number,
  ): Promise<OrderRecord | null> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `
        UPDATE orders
        SET status = ?, version = version + 1
        WHERE id = ? AND version = ?
      `,
      [status, id, expectedVersion],
    );

    if (result.affectedRows === 0) {
      const existing = await this.findById(id);
      if (existing) {
        throw new OptimisticLockConflictError(id, expectedVersion);
      }
      return null;
    }

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
          version,
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
  private async findByIdOrThrow(
    connection: PoolConnection,
    id: number,
  ): Promise<OrderRecord> {
    const [rows] = await connection.query<OrderRow[]>(
      `
        SELECT
          id,
          user_id,
          map_id,
          status,
          total_amount,
          version,
          created_at,
          updated_at
        FROM orders
        WHERE id = ?
        LIMIT 1
      `,
      [id],
    );
    const order = rows[0] ? this.toRecord(rows[0]) : null;

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
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Преобразует результат JOIN-выборки в вложенный объект API.
   */
  private toOverviewRecord(row: OrderOverviewRow): OrderOverviewRecord {
    return {
      orderId: row.order_id,
      status: row.status,
      totalAmount: row.total_amount,
      createdAt: row.created_at,
      user: {
        id: row.user_id,
        email: row.user_email,
        name: row.user_name,
      },
      map: {
        id: row.map_id,
        title: row.map_title,
        latitude: row.latitude,
        longitude: row.longitude,
      },
    };
  }
}
