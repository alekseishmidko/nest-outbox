import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuditLogRepository } from './audit-log.repository';

@Module({
  imports: [DatabaseModule],
  providers: [AuditLogRepository],
  exports: [AuditLogRepository],
})
export class AuditModule {}
