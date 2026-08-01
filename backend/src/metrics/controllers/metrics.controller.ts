import { Controller, Get, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Response } from 'express';
import { MetricsService } from '../services/metrics.service';

/**
 * Controller Prometheus endpoint.
 */
@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  /**
   * Отдает метрики в формате Prometheus exposition.
   */
  @Get()
  async getMetrics(@Res() response: Response): Promise<void> {
    response.setHeader('Content-Type', this.metricsService.getContentType());
    response.send(await this.metricsService.getMetrics());
  }
}
