import { Inject, Injectable } from '@nestjs/common';
import { ResultSetHeader } from 'mysql2';
import { Pool, PoolConnection } from 'mysql2/promise';
import { MYSQL_POOL } from '../../database/connections/mysql-pool.token';
import { CreateUserDto } from '../dto/create-user.dto';
import { ListUsersQueryDto } from '../dto/list-users-query.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { SqlValue } from '../types/sql-value.type';
import { UserActivityPage } from '../types/user-activity-page.type';
import { UserActivityQuery } from '../types/user-activity-query.type';
import { UserActivityRecord } from '../types/user-activity-record.type';
import { UserActivityRow } from '../types/user-activity-row.type';
import { UserRecord } from '../types/user-record.type';
import { UserRow } from '../types/user-row.type';

/**
 * Repository пользователей.
 *
 * Содержит все SQL-запросы к таблице `users`.
 */
@Injectable()
export class UsersRepository {
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  /**
   * Создает пользователя и возвращает созданную запись.
   */
  async create(dto: CreateUserDto): Promise<UserRecord> {
    const avatarSeed = dto.avatarSeed ?? `${dto.email}:${Date.now()}`;
    const [result] = await this.pool.execute<ResultSetHeader>(
      `
        INSERT INTO users (
          email,
          name,
          avatar_seed
        ) VALUES (?, ?, ?)
      `,
      [dto.email, dto.name, avatarSeed],
    );

    return this.findByIdOrThrow(result.insertId);
  }

  /** Создает пользователя через переданное соединение Unit of Work. */
  async createInTransaction(
    connection: PoolConnection,
    dto: CreateUserDto,
  ): Promise<UserRecord> {
    const avatarSeed = dto.avatarSeed ?? `${dto.email}:${Date.now()}`;
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO users (email, name, avatar_seed) VALUES (?, ?, ?)`,
      [dto.email, dto.name, avatarSeed],
    );
    const [rows] = await connection.execute<UserRow[]>(
      `SELECT id, email, name, avatar_seed, created_at, updated_at
       FROM users WHERE id = ? LIMIT 1`,
      [result.insertId],
    );
    if (!rows[0])
      throw new Error(`User ${result.insertId} was not found after insert`);
    return this.toRecord(rows[0]);
  }

  /**
   * Возвращает список пользователей с фильтрацией и пагинацией.
   */
  async findAll(query: ListUsersQueryDto): Promise<UserRecord[]> {
    const limit = Number(query.limit ?? 20);
    const offset = Number(query.offset ?? 0);

    if (query.search) {
      const search = `%${query.search}%`;
      const [rows] = await this.pool.query<UserRow[]>(
        `
          SELECT
            id,
            email,
            name,
            avatar_seed,
            created_at,
            updated_at
          FROM users
          WHERE email LIKE ? OR name LIKE ?
          ORDER BY created_at DESC
          LIMIT ? OFFSET ?
        `,
        [search, search, limit, offset],
      );

      return rows.map(this.toRecord);
    }

    const [rows] = await this.pool.query<UserRow[]>(
      `
        SELECT
          id,
          email,
          name,
          avatar_seed,
          created_at,
          updated_at
        FROM users
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `,
      [limit, offset],
    );

    return rows.map(this.toRecord);
  }

  /**
   * Ищет пользователя по идентификатору.
   */
  async findById(id: number): Promise<UserRecord | null> {
    const [rows] = await this.pool.execute<UserRow[]>(
      `
        SELECT
          id,
          email,
          name,
          avatar_seed,
          created_at,
          updated_at
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
      [id],
    );

    return rows[0] ? this.toRecord(rows[0]) : null;
  }

  /**
   * Возвращает сложный отчет: пользователь, его заказы, карты и последние media.
   *
   * Поддерживает offset и cursor pagination. Cursor-режим использует пару
   * `(created_at, id)`, чтобы не сканировать все предыдущие страницы.
   */
  async findActivity(
    userId: number,
    query: UserActivityQuery,
  ): Promise<UserActivityPage> {
    const values: SqlValue[] = [userId];
    const cursorWhere =
      query.pagination === 'cursor' && query.cursor
        ? 'AND (o.created_at < ? OR (o.created_at = ? AND o.id < ?))'
        : '';

    if (query.pagination === 'cursor' && query.cursor) {
      values.push(
        query.cursor.createdAt,
        query.cursor.createdAt,
        query.cursor.orderId,
      );
    }

    values.push(query.limit + 1);

    if (query.pagination === 'offset') {
      values.push(query.offset);
    }

    const [rows] = await this.pool.query<UserActivityRow[]>(
      `
        SELECT
          u.id AS user_id,
          u.email AS user_email,
          u.name AS user_name,
          o.id AS order_id,
          o.status AS order_status,
          o.total_amount,
          o.created_at AS order_created_at,
          m.id AS map_id,
          m.title AS map_title,
          m.latitude,
          m.longitude,
          user_avatar.id AS user_avatar_asset_id,
          user_avatar.mime_type AS user_avatar_mime_type,
          map_qr.id AS map_qr_asset_id,
          map_qr.mime_type AS map_qr_mime_type
        FROM users AS u
        INNER JOIN orders AS o ON o.user_id = u.id
        INNER JOIN maps AS m ON m.id = o.map_id
        LEFT JOIN (
          SELECT
            owner_id,
            MAX(id) AS asset_id
          FROM media_assets
          WHERE owner_type = 'user' AND type = 'avatar'
          GROUP BY owner_id
        ) AS latest_user_avatar ON latest_user_avatar.owner_id = u.id
        LEFT JOIN media_assets AS user_avatar
          ON user_avatar.id = latest_user_avatar.asset_id
        LEFT JOIN (
          SELECT
            owner_id,
            MAX(id) AS asset_id
          FROM media_assets
          WHERE owner_type = 'map' AND type = 'qr_code'
          GROUP BY owner_id
        ) AS latest_map_qr ON latest_map_qr.owner_id = m.id
        LEFT JOIN media_assets AS map_qr
          ON map_qr.id = latest_map_qr.asset_id
        WHERE u.id = ?
        ${cursorWhere}
        ORDER BY o.created_at DESC, o.id DESC
        LIMIT ?
        ${query.pagination === 'offset' ? 'OFFSET ?' : ''}
      `,
      values,
    );
    const hasMore = rows.length > query.limit;
    const pageRows = rows.slice(0, query.limit);
    const items = pageRows.map(this.toActivityRecord);

    return {
      items,
      pageInfo: this.toActivityPageInfo(query, items, hasMore),
    };
  }

  /**
   * Обновляет пользователя и возвращает свежую запись.
   */
  async update(id: number, dto: UpdateUserDto): Promise<UserRecord | null> {
    const fields: string[] = [];
    const values: SqlValue[] = [];

    if (dto.email !== undefined) {
      fields.push('email = ?');
      values.push(dto.email);
    }

    if (dto.name !== undefined) {
      fields.push('name = ?');
      values.push(dto.name);
    }

    if (dto.avatarSeed !== undefined) {
      fields.push('avatar_seed = ?');
      values.push(dto.avatarSeed);
    }

    if (fields.length > 0) {
      values.push(id);
      await this.pool.execute(
        `
          UPDATE users
          SET ${fields.join(', ')}
          WHERE id = ?
        `,
        values,
      );
    }

    return this.findById(id);
  }

  /**
   * Удаляет пользователя по идентификатору.
   */
  async delete(id: number): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      'DELETE FROM users WHERE id = ?',
      [id],
    );

    return result.affectedRows > 0;
  }

  /**
   * Возвращает созданного пользователя или падает, если insert не дал читаемой записи.
   */
  private async findByIdOrThrow(id: number): Promise<UserRecord> {
    const user = await this.findById(id);

    if (!user) {
      throw new Error(`User ${id} was not found after insert`);
    }

    return user;
  }

  /**
   * Преобразует snake_case строку MySQL в camelCase доменный тип.
   */
  private toRecord(row: UserRow): UserRecord {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      avatarSeed: row.avatar_seed,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Преобразует строку сложного JOIN-отчета в API record.
   */
  private toActivityRecord(row: UserActivityRow): UserActivityRecord {
    return {
      user: {
        id: row.user_id,
        email: row.user_email,
        name: row.user_name,
        avatarAsset:
          row.user_avatar_asset_id && row.user_avatar_mime_type
            ? {
                id: row.user_avatar_asset_id,
                mimeType: row.user_avatar_mime_type,
              }
            : null,
      },
      order: {
        id: row.order_id,
        status: row.order_status,
        totalAmount: row.total_amount,
        createdAt: row.order_created_at,
      },
      map: {
        id: row.map_id,
        title: row.map_title,
        latitude: row.latitude,
        longitude: row.longitude,
        qrAsset:
          row.map_qr_asset_id && row.map_qr_mime_type
            ? {
                id: row.map_qr_asset_id,
                mimeType: row.map_qr_mime_type,
              }
            : null,
      },
    };
  }

  /**
   * Формирует metadata страницы для offset или cursor pagination.
   */
  private toActivityPageInfo(
    query: UserActivityQuery,
    items: UserActivityRecord[],
    hasMore: boolean,
  ): UserActivityPage['pageInfo'] {
    if (query.pagination === 'offset') {
      const pageInfo: UserActivityPage['pageInfo'] = {
        pagination: 'offset',
        limit: query.limit,
        offset: query.offset,
        hasMore,
      };

      if (hasMore) {
        pageInfo.nextOffset = query.offset + query.limit;
      }

      return pageInfo;
    }

    const lastItem = items.at(-1);
    const pageInfo: UserActivityPage['pageInfo'] = {
      pagination: 'cursor',
      limit: query.limit,
      hasMore,
    };

    if (hasMore && lastItem) {
      pageInfo.nextCursor = this.encodeActivityCursor(
        lastItem.order.createdAt,
        lastItem.order.id,
      );
    }

    return pageInfo;
  }

  /**
   * Кодирует cursor в base64url, чтобы клиент не зависел от внутреннего формата.
   */
  private encodeActivityCursor(createdAt: Date, orderId: number): string {
    return Buffer.from(
      JSON.stringify({
        createdAt: createdAt.toISOString(),
        orderId,
      }),
      'utf8',
    ).toString('base64url');
  }
}
