import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthController } from './controllers/auth.controller';
import { AuthRepository } from './repositories/auth.repository';
import { AuthService } from './services/auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { RolesGuard } from './guards/roles.guard';
import { OwnershipGuard } from './guards/ownership.guard';

/** Модуль JWT authentication, ролей и rate limiting. */
@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [
    AuthRepository,
    AuthService,
    JwtAuthGuard,
    RolesGuard,
    RateLimitGuard,
    OwnershipGuard,
  ],
  exports: [
    AuthService,
    JwtAuthGuard,
    RolesGuard,
    RateLimitGuard,
    OwnershipGuard,
  ],
})
export class AuthModule {}
