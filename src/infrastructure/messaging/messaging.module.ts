import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ApplicationModule } from '../../application/application.module';
import { SqsPublisherService } from './sqs-publisher.service';
import { OutboxPublisherWorker } from './outbox-publisher.worker';
import { SqsConsumerWorker } from './sqs-consumer.worker';
import { PendingReferenceWorker } from './pending-reference.worker';

@Module({
  imports: [DatabaseModule, ApplicationModule],
  providers: [
    SqsPublisherService,
    OutboxPublisherWorker,
    SqsConsumerWorker,
    PendingReferenceWorker,
  ],
})
export class MessagingModule {}
