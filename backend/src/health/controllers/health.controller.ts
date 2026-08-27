import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService } from '../services/health.service';
import { HealthCheckResult } from '../types/health-check-result.type';

/**
 * HTTP controller для health-check endpoints.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Проверить готовность приложения и инфраструктуры' })
  checkReadiness(): Promise<HealthCheckResult> {
    return this.healthService.checkReadiness();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Проверить готовность MySQL, storage и worker' })
  checkReady(): Promise<HealthCheckResult> {
    return this.healthService.checkReadiness();
  }

  @Get('live')
  @ApiOperation({ summary: 'Проверить, что HTTP-процесс приложения жив' })
  checkLiveness(): Pick<HealthCheckResult, 'status' | 'timestamp'> {
    return this.healthService.checkLiveness();
  }
}
