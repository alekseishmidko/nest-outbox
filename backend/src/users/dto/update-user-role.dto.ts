import { IsIn } from 'class-validator';
import { AuthRole } from '../../auth/types/auth-user.type';

export class UpdateUserRoleDto {
  @IsIn(['admin', 'user'])
  role!: AuthRole;
}
