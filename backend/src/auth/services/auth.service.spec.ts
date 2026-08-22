import * as argon2 from 'argon2';
import * as jwt from 'jsonwebtoken';
import { AuthRepository } from '../repositories/auth.repository';
import { AuthService } from './auth.service';

const user = { id: 1, email: 'user@example.com', role: 'user' as const };

describe('AuthService refresh-token security', () => {
  it('issues a refresh token with a token family', async () => {
    const repository = {
      createUser: jest.fn().mockImplementation(async ({ passwordHash }) => {
        expect(passwordHash).not.toBe('password-password');
        expect(await argon2.verify(passwordHash, 'password-password')).toBe(
          true,
        );
        return user;
      }),
      saveRefreshToken: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AuthService(repository as unknown as AuthRepository);

    const tokens = await service.register({
      email: user.email,
      name: 'User',
      password: 'password-password',
    });

    expect(tokens.refreshToken).toEqual(expect.any(String));
    expect(repository.saveRefreshToken).toHaveBeenCalledWith(
      1,
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.any(Date),
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
  });

  it('rotates a token and detects reuse of the old token', async () => {
    const repository = {
      findRefreshToken: jest.fn().mockResolvedValue({
        id: 10,
        userId: user.id,
        email: user.email,
        role: user.role,
        tokenFamilyId: 'family-1',
        expiresAt: new Date(Date.now() + 60_000),
        rotatedAt: null,
        revokedAt: null,
      }),
      rotateRefreshToken: jest
        .fn()
        .mockResolvedValueOnce({ status: 'rotated', user })
        .mockResolvedValueOnce({ status: 'reuse' }),
    };
    const service = new AuthService(repository as unknown as AuthRepository);
    const refreshToken = issueRefreshToken('family-1');

    const next = await service.refresh({ refreshToken });
    expect(next.refreshToken).not.toBe(refreshToken);
    await expect(service.refresh({ refreshToken })).rejects.toThrow(
      'token family отозвана',
    );
    expect(repository.rotateRefreshToken).toHaveBeenCalledTimes(2);
  });

  it('rejects an expired token', async () => {
    const repository = {
      findRefreshToken: jest.fn().mockResolvedValue({
        id: 10,
        userId: user.id,
        email: user.email,
        role: user.role,
        tokenFamilyId: 'family-1',
        expiresAt: new Date(Date.now() - 1_000),
        rotatedAt: null,
        revokedAt: null,
      }),
      rotateRefreshToken: jest.fn().mockResolvedValue({ status: 'expired' }),
    };
    const service = new AuthService(repository as unknown as AuthRepository);
    const refreshToken = issueRefreshToken('family-1');

    await expect(service.refresh({ refreshToken })).rejects.toThrow('истек');
  });

  it('revokes every refresh token on logout', async () => {
    const repository = {
      revokeAllRefreshTokens: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AuthService(repository as unknown as AuthRepository);

    await service.logout(user);

    expect(repository.revokeAllRefreshTokens).toHaveBeenCalledWith(user.id);
  });
});

function issueRefreshToken(familyId: string): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'refresh',
      familyId,
    },
    'dev-refresh-secret-change-me',
    { expiresIn: 60 * 60 },
  );
}
