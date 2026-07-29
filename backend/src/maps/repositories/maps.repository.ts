import { Inject, Injectable } from '@nestjs/common';
import { ResultSetHeader } from 'mysql2';
import { Pool } from 'mysql2/promise';
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

  async findAll(query: ListMapsQueryDto): Promise<MapRecord[]> {
    const where: string[] = [];
    const values: SqlValue[] = [];

    if (query.ownerUserId !== undefined) {
      where.push('owner_user_id = ?');
      values.push(query.ownerUserId);
    }

    if (query.search) {
      where.push('title LIKE ?');
      values.push(`%${query.search}%`);
    }

    values.push(query.limit ?? 20, query.offset ?? 0);

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
        ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `,
      values,
    );

    return rows.map(this.toRecord);
  }

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

  async delete(id: number): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      'DELETE FROM maps WHERE id = ?',
      [id],
    );

    return result.affectedRows > 0;
  }

  private async findByIdOrThrow(id: number): Promise<MapRecord> {
    const map = await this.findById(id);

    if (!map) {
      throw new Error(`Map ${id} was not found after insert`);
    }

    return map;
  }

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
