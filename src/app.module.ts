import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApplicationModule } from './application/application.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { MessagingModule } from './infrastructure/messaging/messaging.module';
import { WalletController } from './presentation/http/wallet.controller';
import {
  WagerTransactionController,
  ProviderTransactionsController,
} from './presentation/http/wager.controller';
import { HealthController } from './presentation/http/health.controller';
import { MetricsController } from './presentation/http/metrics.controller';
import { MetricsService } from './infrastructure/monitoring/metrics.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    ApplicationModule,
    MessagingModule, // Background workers for SQS, Outbox, and Pending References
  ],
  controllers: [
    WalletController,
    WagerTransactionController,
    ProviderTransactionsController,
    HealthController,
    MetricsController,
  ],
  providers: [MetricsService],
})
export class AppModule {}
