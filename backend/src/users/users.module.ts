import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './controllers/users.controller';
import { UsersRepository } from './repositories/users.repository';
import { UsersService } from './services/users.service';
import { UserActivityQueryHandler } from './queries/user-activity-query.handler';
import { AuditModule } from '../audit/audit.module';

/**
 * Модуль пользователей.
 *
 * Отвечает за HTTP API, бизнес-логику и SQL-доступ к таблице `users`.
 */
@Module({
  imports: [DatabaseModule, AuthModule, AuditModule],
  controllers: [UsersController],
  providers: [UsersRepository, UsersService, UserActivityQueryHandler],
  exports: [UsersService, UsersRepository],
})
export class UsersModule {}
