import { SetMetadata } from '@nestjs/common';
import { AuthRole } from '../types/auth-user.type';

export const ROLES_KEY = 'auth_roles';
export const Roles = (...roles: AuthRole[]) => SetMetadata(ROLES_KEY, roles);
