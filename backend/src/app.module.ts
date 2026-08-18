import { Module } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { InboxModule } from './inbox/inbox.module';
import { MapsModule } from './maps/maps.module';
import { MediaModule } from './media/media.module';
import { MetricsModule } from './metrics/metrics.module';
import { OrdersModule } from './orders/orders.module';
import { OutboxModule } from './outbox/outbox.module';
import { ReportsModule } from './reports/reports.module';
import { RoutesModule } from './routes/routes.module';
import { SeedModule } from './seed/seed.module';
import { TransactionsLabModule } from './transactions-lab/transactions-lab.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        genReqId: (request) =>
          request.headers['x-request-id']?.toString() ?? randomUUID(),
        customProps: (request) => ({
          requestId: request.id,
        }),
        customSuccessMessage: (request, response) =>
          `${request.method} ${request.url} ${response.statusCode}`,
        customErrorMessage: (request, response) =>
          `${request.method} ${request.url} ${response.statusCode}`,
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.password',
          ],
          remove: true,
        },
      },
    }),
    AuthModule,
    DatabaseModule,
    HealthModule,
    InboxModule,
    MapsModule,
    MediaModule,
    MetricsModule,
    OrdersModule,
    OutboxModule,
    ReportsModule,
    RoutesModule,
    SeedModule,
    TransactionsLabModule,
    UsersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
