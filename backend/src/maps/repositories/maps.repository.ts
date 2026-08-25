import { Inject, Injectable, Optional } from '@nestjs/common';
import { ResultSetHeader } from 'mysql2';
import { Pool, PoolConnection } from 'mysql2/promise';
import { MYSQL_POOL } from '../../database/connections/mysql-pool.token';
import { CreateMapDto } from '../dto/create-map.dto';
import { ListMapsQueryDto } from '../dto/list-maps-query.dto';
import { UpdateMapDto } from '../dto/update-map.dto';
import { MapRecord } from '../types/map-record.type';
import { MapRow } from '../types/map-row.type';
import { SqlValue } from '../types/sql-value.type';
import { createMapsQueryObject } from '../../common/sql/query-objects/maps.query-object';
import { AuditLogRepository } from '../../audit/audit-log.repository';

/**
 * Repository карт.
 *
 * Содержит все SQL-запросы к таблице `maps`.
 */
@Injectable()
export class MapsRepository {
  constructor(
    @Inject(MYSQL_POOL) private readonly pool: Pool,
    @Optional() private readonly auditLog?: AuditLogRepository,
  ) {}

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
    const queryObject = createMapsQueryObject(query);

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
        WHERE deleted_at IS NULL${queryObject.where ? ` AND ${queryObject.where.replace(/^WHERE /, '')}` : ''}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `,
      [...queryObject.params, queryObject.limit, queryObject.offset],
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
        WHERE id = ? AND deleted_at IS NULL
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
  async update(
    id: number,
    dto: UpdateMapDto,
    actorUserId?: number,
  ): Promise<MapRecord | null> {
    const before = await this.findById(id);
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
    if (dto.ownerUserId !== undefined) {
      fields.push('owner_user_id = ?');
      values.push(dto.ownerUserId);
    }

    if (fields.length > 0) {
      fields.push('updated_by = ?');
      values.push(actorUserId ?? null, id);
      await this.pool.execute(
        `
          UPDATE maps
          SET ${fields.join(', ')}
          WHERE id = ? AND deleted_at IS NULL
        `,
        values,
      );
    }

    const after = await this.findById(id);
    if (before && after && before.ownerUserId !== after.ownerUserId) {
      await this.auditLog?.append({
        actorUserId: actorUserId ?? null,
        action: 'ownership_change',
        entityType: 'map',
        entityId: id,
        before: { ownerUserId: before.ownerUserId },
        after: { ownerUserId: after.ownerUserId },
      });
    }
    return after;
  }

  /**
   * Удаляет карту по идентификатору.
   *
   * Возвращает `true`, если MySQL реально удалил строку.
   */
  async delete(id: number, actorUserId?: number): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      'UPDATE maps SET deleted_at = CURRENT_TIMESTAMP(3), updated_by = ? WHERE id = ? AND deleted_at IS NULL',
      [actorUserId ?? null, id],
    );

    return result.affectedRows > 0;
  }

  async restore(id: number, actorUserId?: number): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      'UPDATE maps SET deleted_at = NULL, updated_by = ? WHERE id = ? AND deleted_at IS NOT NULL',
      [actorUserId ?? null, id],
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
