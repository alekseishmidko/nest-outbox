import { Inject, Injectable } from '@nestjs/common';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { Pool } from 'mysql2/promise';
import { MYSQL_POOL } from '../../database/connections/mysql-pool.token';
import { AuthRole, AuthUser } from '../types/auth-user.type';

type AuthRow = RowDataPacket & {
  id: number;
  email: string;
  name: string;
  avatar_seed: string;
  password_hash: string | null;
  role: AuthRole;
  refresh_token_hash: string | null;
  refresh_token_expires_at: Date | null;
};

/** Raw SQL repository for authentication and refresh-token rotation. */
@Injectable()
export class AuthRepository {
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  async createUser(input: {
    email: string;
    name: string;
    avatarSeed?: string;
    passwordHash: string;
  }): Promise<AuthUser> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `
        INSERT INTO users (email, name, avatar_seed, password_hash, role)
        VALUES (?, ?, ?, ?, 'user')
      `,
      [
        input.email,
        input.name,
        input.avatarSeed ?? `${input.email}:${Date.now()}`,
        input.passwordHash,
      ],
    );
    const user = await this.findById(result.insertId);

    if (!user) {
      throw new Error(
        `User ${result.insertId} was not found after registration`,
      );
    }

    return this.toAuthUser(user);
  }

  async findByEmail(email: string): Promise<AuthRow | null> {
    const [rows] = await this.pool.execute<AuthRow[]>(
      `
        SELECT id, email, name, avatar_seed, password_hash, role,
               refresh_token_hash, refresh_token_expires_at
        FROM users WHERE email = ? LIMIT 1
      `,
      [email],
    );
    return rows[0] ?? null;
  }

  async findById(id: number): Promise<AuthRow | null> {
    const [rows] = await this.pool.execute<AuthRow[]>(
      `
        SELECT id, email, name, avatar_seed, password_hash, role,
               refresh_token_hash, refresh_token_expires_at
        FROM users WHERE id = ? LIMIT 1
      `,
      [id],
    );
    return rows[0] ?? null;
  }

  async saveRefreshToken(
    userId: number,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.pool.execute(
      `
        UPDATE users
        SET refresh_token_hash = ?, refresh_token_expires_at = ?
        WHERE id = ?
      `,
      [tokenHash, expiresAt, userId],
    );
  }

  async clearRefreshToken(userId: number): Promise<void> {
    await this.pool.execute(
      `
        UPDATE users
        SET refresh_token_hash = NULL, refresh_token_expires_at = NULL
        WHERE id = ?
      `,
      [userId],
    );
  }

  private toAuthUser(row: AuthRow): AuthUser {
    return { id: row.id, email: row.email, role: row.role };
  }
}
