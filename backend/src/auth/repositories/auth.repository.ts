import { Inject, Injectable } from '@nestjs/common';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { Pool } from 'mysql2/promise';
import { MYSQL_POOL } from '../../database/connections/mysql-pool.token';
import { AuthRole, AuthUser } from '../types/auth-user.type';

type UserAuthRow = RowDataPacket & {
  id: number;
  email: string;
  name: string;
  avatar_seed: string;
  password_hash: string | null;
  role: AuthRole;
};

export type RefreshTokenRow = {
  id: number;
  userId: number;
  email: string;
  role: AuthRole;
  tokenFamilyId: string;
  expiresAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
};

export type RefreshRotationResult =
  | { status: 'rotated'; user: AuthUser }
  | { status: 'reuse' | 'expired' | 'invalid' };

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

  async findByEmail(email: string): Promise<UserAuthRow | null> {
    const [rows] = await this.pool.execute<UserAuthRow[]>(
      `
        SELECT id, email, name, avatar_seed, password_hash, role
        FROM users WHERE email = ? LIMIT 1
      `,
      [email],
    );
    return rows[0] ?? null;
  }

  async findById(id: number): Promise<UserAuthRow | null> {
    const [rows] = await this.pool.execute<UserAuthRow[]>(
      `
        SELECT id, email, name, avatar_seed, password_hash, role
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
    tokenFamilyId: string,
  ): Promise<void> {
    await this.pool.execute(
      `
        INSERT INTO refresh_tokens
          (user_id, token_hash, token_family_id, expires_at)
        VALUES (?, ?, ?, ?)
      `,
      [userId, tokenHash, tokenFamilyId, expiresAt],
    );
  }

  async findRefreshToken(tokenHash: string): Promise<RefreshTokenRow | null> {
    const [rows] = await this.pool.execute<
      (RowDataPacket & {
        id: number;
        user_id: number;
        email: string;
        role: AuthRole;
        token_family_id: string;
        expires_at: Date;
        rotated_at: Date | null;
        revoked_at: Date | null;
      })[]
    >(
      `
        SELECT rt.id, rt.user_id, u.email, u.role, rt.token_family_id,
               rt.expires_at, rt.rotated_at, rt.revoked_at
        FROM refresh_tokens rt
        JOIN users u ON u.id = rt.user_id
        WHERE rt.token_hash = ?
        LIMIT 1
      `,
      [tokenHash],
    );
    const row = rows[0];
    return row
      ? {
          id: row.id,
          userId: row.user_id,
          email: row.email,
          role: row.role,
          tokenFamilyId: row.token_family_id,
          expiresAt: row.expires_at,
          rotatedAt: row.rotated_at,
          revokedAt: row.revoked_at,
        }
      : null;
  }

  async rotateRefreshToken(
    tokenHash: string,
    nextTokenHash: string,
    nextExpiresAt: Date,
  ): Promise<RefreshRotationResult> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<
        (RowDataPacket & {
          id: number;
          user_id: number;
          email: string;
          role: AuthRole;
          token_family_id: string;
          expires_at: Date;
          rotated_at: Date | null;
          revoked_at: Date | null;
        })[]
      >(
        `
          SELECT rt.id, rt.user_id, u.email, u.role, rt.token_family_id,
                 rt.expires_at, rt.rotated_at, rt.revoked_at
          FROM refresh_tokens rt
          JOIN users u ON u.id = rt.user_id
          WHERE rt.token_hash = ?
          LIMIT 1
          FOR UPDATE
        `,
        [tokenHash],
      );
      const row = rows[0];

      if (!row) {
        await connection.rollback();
        return { status: 'invalid' };
      }

      if (row.revoked_at || row.rotated_at) {
        await connection.execute(
          `
            UPDATE refresh_tokens
            SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP(3))
            WHERE token_family_id = ?
          `,
          [row.token_family_id],
        );
        await connection.commit();
        return { status: 'reuse' };
      }

      if (row.expires_at.getTime() <= Date.now()) {
        await connection.execute(
          'UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP(3) WHERE id = ?',
          [row.id],
        );
        await connection.commit();
        return { status: 'expired' };
      }

      await connection.execute(
        'UPDATE refresh_tokens SET rotated_at = CURRENT_TIMESTAMP(3) WHERE id = ?',
        [row.id],
      );
      await connection.execute(
        `
          INSERT INTO refresh_tokens
            (user_id, token_hash, token_family_id, expires_at)
          VALUES (?, ?, ?, ?)
        `,
        [row.user_id, nextTokenHash, row.token_family_id, nextExpiresAt],
      );
      await connection.commit();
      return {
        status: 'rotated',
        user: { id: row.user_id, email: row.email, role: row.role },
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async revokeAllRefreshTokens(userId: number): Promise<void> {
    await this.pool.execute(
      `
        UPDATE refresh_tokens
        SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP(3))
        WHERE user_id = ? AND revoked_at IS NULL
      `,
      [userId],
    );
  }

  private toAuthUser(row: UserAuthRow): AuthUser {
    return { id: row.id, email: row.email, role: row.role };
  }
}
