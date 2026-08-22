import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash, randomUUID } from 'node:crypto';
import * as jwt from 'jsonwebtoken';
import { isMysqlDuplicateEntryError } from '../../common/utils/mysql-error.util';
import { AuthRepository } from '../repositories/auth.repository';
import { LoginDto } from '../dto/login.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { RegisterDto } from '../dto/register.dto';
import { AuthTokens } from '../types/auth-tokens.type';
import { AuthUser } from '../types/auth-user.type';
import { JwtPayload } from '../types/jwt-payload.type';

const ACCESS_EXPIRES_IN_SECONDS = 900;
const REFRESH_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 30;

/** Authentication service with Argon2 passwords and rotating refresh tokens. */
@Injectable()
export class AuthService {
  private readonly accessSecret =
    process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-me';
  private readonly refreshSecret =
    process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me';

  constructor(private readonly authRepository: AuthRepository) {}

  async register(dto: RegisterDto): Promise<AuthTokens> {
    try {
      const passwordHash = await argon2.hash(dto.password, {
        type: argon2.argon2id,
      });
      const user = await this.authRepository.createUser({
        ...dto,
        passwordHash,
      });
      return this.issueTokens(user);
    } catch (error) {
      if (isMysqlDuplicateEntryError(error)) {
        throw new ConflictException('Email уже используется');
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const row = await this.authRepository.findByEmail(dto.email);
    if (
      !row?.password_hash ||
      !(await argon2.verify(row.password_hash, dto.password))
    ) {
      throw new UnauthorizedException('Неверный email или пароль');
    }
    return this.issueTokens({ id: row.id, email: row.email, role: row.role });
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthTokens> {
    const payload = this.verifyToken(
      dto.refreshToken,
      this.refreshSecret,
      'refresh',
    );
    const tokenHash = this.hashToken(dto.refreshToken);
    const current = await this.authRepository.findRefreshToken(tokenHash);
    if (!current || current.userId !== payload.sub) {
      throw new UnauthorizedException(
        'Refresh token недействителен или отозван',
      );
    }

    if (payload.familyId && payload.familyId !== current.tokenFamilyId) {
      throw new UnauthorizedException(
        'Refresh token недействителен или отозван',
      );
    }

    const next = this.createTokens(
      { id: current.userId, email: current.email, role: current.role },
      current.tokenFamilyId,
    );
    const result = await this.authRepository.rotateRefreshToken(
      tokenHash,
      next.refreshTokenHash,
      next.refreshExpiresAt,
    );

    if (result.status === 'reuse') {
      throw new UnauthorizedException(
        'Обнаружено повторное использование refresh token; token family отозвана',
      );
    }
    if (result.status !== 'rotated') {
      throw new UnauthorizedException(
        result.status === 'expired'
          ? 'Refresh token истек'
          : 'Refresh token недействителен или отозван',
      );
    }

    return next.tokens;
  }

  async logout(user: AuthUser): Promise<void> {
    await this.authRepository.revokeAllRefreshTokens(user.id);
  }

  verifyAccessToken(token: string): AuthUser {
    const payload = this.verifyToken(token, this.accessSecret, 'access');
    return { id: payload.sub, email: payload.email, role: payload.role };
  }

  private async issueTokens(user: AuthUser): Promise<AuthTokens> {
    const familyId = randomUUID();
    const issued = this.createTokens(user, familyId);
    await this.authRepository.saveRefreshToken(
      user.id,
      issued.refreshTokenHash,
      issued.refreshExpiresAt,
      familyId,
    );
    return issued.tokens;
  }

  private createTokens(
    user: AuthUser,
    familyId: string,
  ): {
    tokens: AuthTokens;
    refreshTokenHash: string;
    refreshExpiresAt: Date;
  } {
    const basePayload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = jwt.sign(
      { ...basePayload, type: 'access' },
      this.accessSecret,
      { expiresIn: ACCESS_EXPIRES_IN_SECONDS },
    );
    const refreshToken = jwt.sign(
      { ...basePayload, type: 'refresh', familyId, jti: randomUUID() },
      this.refreshSecret,
      { expiresIn: REFRESH_EXPIRES_IN_SECONDS },
    );
    const refreshExpiresAt = new Date(
      Date.now() + REFRESH_EXPIRES_IN_SECONDS * 1000,
    );
    return {
      tokens: {
        accessToken,
        refreshToken,
        tokenType: 'Bearer',
        expiresInSeconds: ACCESS_EXPIRES_IN_SECONDS,
      },
      refreshTokenHash: this.hashToken(refreshToken),
      refreshExpiresAt,
    };
  }

  private verifyToken(
    token: string,
    secret: string,
    type: JwtPayload['type'],
  ): JwtPayload {
    try {
      const payload = jwt.verify(token, secret) as unknown as JwtPayload;
      if (
        payload.type !== type ||
        typeof payload.sub !== 'number' ||
        !payload.email
      ) {
        throw new Error('Invalid token claims');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('JWT недействителен или истек');
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
