import { Module } from '@nestjs/common';
import { MediaSecurityService } from './media-security.service';

@Module({ providers: [MediaSecurityService], exports: [MediaSecurityService] })
export class SecurityModule {}
