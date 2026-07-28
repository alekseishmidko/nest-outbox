import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { MapsModule } from './maps/maps.module';
import { MediaModule } from './media/media.module';
import { MetricsModule } from './metrics/metrics.module';
import { OrdersModule } from './orders/orders.module';
import { OutboxModule } from './outbox/outbox.module';
import { SeedModule } from './seed/seed.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    DatabaseModule,
    HealthModule,
    MapsModule,
    MediaModule,
    MetricsModule,
    OrdersModule,
    OutboxModule,
    SeedModule,
    UsersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
