import { Inject, Injectable } from '@nestjs/common';
import { ResultSetHeader } from 'mysql2';
import { Pool, PoolConnection } from 'mysql2/promise';
import { MYSQL_POOL } from '../../database/connections/mysql-pool.token';
import { CreateMapDto } from '../dto/create-map.dto';
import { ListMapsQueryDto } from '../dto/list-maps-query.dto';
import { UpdateMapDto } from '../dto/update-map.dto';
import { MapRecord } from '../types/map-record.type';
import { MapRow } from '../types/map-row.type';
import { SqlValue } from '../types/sql-value.type';

/**
 * Repository карт.
 *
 * Содержит все SQL-запросы к таблице `maps`.
 */
@Injectable()
export class MapsRepository {
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  /**
   * Создает карту и возвращает полную запись из БД.
   *
   * `description` может быть пустым, поэтому передается как `NULL`.
   */
  async create(dto: CreateMapDto): Promise<MapRecord> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `
        INSERT INTO maps (
          title,
          description,
          latitude,
          longitude,
          owner_user_id
        ) VALUES (?, ?, ?, ?, ?)
      `,
      [
        dto.title,
        dto.description ?? null,
        dto.latitude,
        dto.longitude,
        dto.ownerUserId,
      ],
    );

    return this.findByIdOrThrow(result.insertId);
  }

  /** Создает карту через переданное соединение Unit of Work. */
  async createInTransaction(
    connection: PoolConnection,
    dto: CreateMapDto,
  ): Promise<MapRecord> {
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO maps (title, description, latitude, longitude, owner_user_id)
       VALUES (?, ?, ?, ?, ?)`,
      [
        dto.title,
        dto.description ?? null,
        dto.latitude,
        dto.longitude,
        dto.ownerUserId,
      ],
    );
    const [rows] = await connection.execute<MapRow[]>(
      `SELECT id, title, description, latitude, longitude, owner_user_id,
              created_at, updated_at
       FROM maps WHERE id = ? LIMIT 1`,
      [result.insertId],
    );
    if (!rows[0])
      throw new Error(`Map ${result.insertId} was not found after insert`);
    return this.toRecord(rows[0]);
  }

  /**
   * Возвращает список карт с фильтрацией по владельцу и поиском по названию.
   *
   * Для `LIMIT/OFFSET` используется `query()`, а не `execute()`, потому что
   * MySQL native prepared statements в некоторых окружениях падают на
   * параметризованной пагинации с `Incorrect arguments to mysqld_stmt_execute`.
   */
  async findAll(query: ListMapsQueryDto): Promise<MapRecord[]> {
    const limit = Number(query.limit ?? 20);
    const offset = Number(query.offset ?? 0);
    const where: string[] = [];
    const values: SqlValue[] = [];

    if (query.ownerUserId !== undefined) {
      where.push('owner_user_id = ?');
      values.push(Number(query.ownerUserId));
    }

    if (query.search) {
      where.push('title LIKE ?');
      values.push(`%${query.search}%`);
    }

    values.push(limit, offset);

    const [rows] = await this.pool.query<MapRow[]>(
      `
        SELECT
          id,
          title,
          description,
          latitude,
          longitude,
          owner_user_id,
          created_at,
          updated_at
        FROM maps
        ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `,
      values,
    );

    return rows.map(this.toRecord);
  }

  /**
   * Ищет карту по идентификатору.
   */
  async findById(id: number): Promise<MapRecord | null> {
    const [rows] = await this.pool.execute<MapRow[]>(
      `
        SELECT
          id,
          title,
          description,
          latitude,
          longitude,
          owner_user_id,
          created_at,
          updated_at
        FROM maps
        WHERE id = ?
        LIMIT 1
      `,
      [id],
    );

    return rows[0] ? this.toRecord(rows[0]) : null;
  }

  /**
   * Частично обновляет карту и возвращает актуальное состояние записи.
   *
   * SQL собирается только из разрешенных полей DTO. Пользовательский ввод не
   * попадает в имена колонок, значения передаются через placeholders.
   */
  async update(id: number, dto: UpdateMapDto): Promise<MapRecord | null> {
    const fields: string[] = [];
    const values: SqlValue[] = [];

    if (dto.title !== undefined) {
      fields.push('title = ?');
      values.push(dto.title);
    }

    if (dto.description !== undefined) {
      fields.push('description = ?');
      values.push(dto.description);
    }

    if (dto.latitude !== undefined) {
      fields.push('latitude = ?');
      values.push(dto.latitude);
    }

    if (dto.longitude !== undefined) {
      fields.push('longitude = ?');
      values.push(dto.longitude);
    }

    if (fields.length > 0) {
      values.push(id);
      await this.pool.execute(
        `
          UPDATE maps
          SET ${fields.join(', ')}
          WHERE id = ?
        `,
        values,
      );
    }

    return this.findById(id);
  }

  /**
   * Удаляет карту по идентификатору.
   *
   * Возвращает `true`, если MySQL реально удалил строку.
   */
  async delete(id: number): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      'DELETE FROM maps WHERE id = ?',
      [id],
    );

    return result.affectedRows > 0;
  }

  /**
   * Возвращает созданную карту или падает, если insert не дал читаемой записи.
   */
  private async findByIdOrThrow(id: number): Promise<MapRecord> {
    const map = await this.findById(id);

    if (!map) {
      throw new Error(`Map ${id} was not found after insert`);
    }

    return map;
  }

  /**
   * Преобразует snake_case строку MySQL в camelCase доменный тип.
   */
  private toRecord(row: MapRow): MapRecord {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      latitude: row.latitude,
      longitude: row.longitude,
      ownerUserId: row.owner_user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
