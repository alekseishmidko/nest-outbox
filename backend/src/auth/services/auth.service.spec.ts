import * as argon2 from 'argon2';
import { AuthRepository } from '../repositories/auth.repository';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  it('хеширует пароль и выдает access/refresh tokens', async () => {
    const repository = {
      createUser: jest.fn().mockImplementation(async ({ passwordHash }) => {
        expect(passwordHash).not.toBe('password-password');
        expect(await argon2.verify(passwordHash, 'password-password')).toBe(
          true,
        );
        return { id: 1, email: 'user@example.com', role: 'user' };
      }),
      saveRefreshToken: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AuthService(repository as unknown as AuthRepository);

    const tokens = await service.register({
      email: 'user@example.com',
      name: 'User',
      password: 'password-password',
    });

    expect(tokens.accessToken).toEqual(expect.any(String));
    expect(tokens.refreshToken).toEqual(expect.any(String));
    expect(tokens.tokenType).toBe('Bearer');
    expect(repository.saveRefreshToken).toHaveBeenCalledWith(
      1,
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.any(Date),
    );
  });

  it('ротирует refresh token и отклоняет повтор старого token', async () => {
    const row = {
      id: 1,
      email: 'user@example.com',
      role: 'user' as const,
      password_hash: null as string | null,
      refresh_token_hash: null as string | null,
      refresh_token_expires_at: null as Date | null,
    };
    const repository = {
      createUser: jest.fn().mockImplementation(async ({ passwordHash }) => {
        row.password_hash = passwordHash;
        return { id: row.id, email: row.email, role: row.role };
      }),
      findByEmail: jest.fn().mockResolvedValue(row),
      findById: jest.fn().mockResolvedValue(row),
      saveRefreshToken: jest
        .fn()
        .mockImplementation(async (_id, hash, expires) => {
          row.refresh_token_hash = hash;
          row.refresh_token_expires_at = expires;
        }),
      clearRefreshToken: jest.fn().mockImplementation(async () => {
        row.refresh_token_hash = null;
        row.refresh_token_expires_at = null;
      }),
    };
    const service = new AuthService(repository as unknown as AuthRepository);
    const first = await service.register({
      email: row.email,
      name: 'User',
      password: 'password-password',
    });

    const next = await service.refresh({ refreshToken: first.refreshToken });
    expect(next.refreshToken).not.toBe(first.refreshToken);
    await expect(
      service.refresh({ refreshToken: first.refreshToken }),
    ).rejects.toThrow('недействителен');
  });
});
