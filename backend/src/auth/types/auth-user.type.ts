export type AuthRole = 'admin' | 'user';

export type AuthUser = {
  id: number;
  email: string;
  role: AuthRole;
};
