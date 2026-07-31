import { Inject, Injectable } from '@nestjs/common';
import { ResultSetHeader } from 'mysql2';
import { Pool } from 'mysql2/promise';
import { MYSQL_POOL } from '../../database/connections/mysql-pool.token';
import { CreateUserDto } from '../dto/create-user.dto';
import { ListUsersQueryDto } from '../dto/list-users-query.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { SqlValue } from '../types/sql-value.type';
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
}
