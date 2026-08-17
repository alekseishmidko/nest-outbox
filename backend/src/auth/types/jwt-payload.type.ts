import { AuthRole } from './auth-user.type';

export type JwtPayload = {
  sub: number;
  email: string;
  role: AuthRole;
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
};
