import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  Inject,
} from '@nestjs/common';
import { SqsPublisherService } from './sqs-publisher.service';
import { OUTBOX_REPOSITORY } from '../../application/ports/outbox-repository.port';
import type { OutboxRepositoryPort } from '../../application/ports/outbox-repository.port';

@Injectable()
export class OutboxPublisherWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxPublisherWorker.name);
  private isShuttingDown = false;
  private intervalId?: ReturnType<typeof setInterval>;

  constructor(
    @Inject(OUTBOX_REPOSITORY)
    private readonly outboxRepository: OutboxRepositoryPort,
    private readonly sqsPublisher: SqsPublisherService,
  ) {}

  onApplicationBootstrap() {
    this.logger.log('Starting Outbox Publisher Worker...');
    this.startPolling();
  }

  onApplicationShutdown() {
    this.logger.log('Shutting down Outbox Publisher Worker...');
    this.isShuttingDown = true;
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  private startPolling() {
    // Poll every 2 seconds
    this.intervalId = setInterval(() => {
      this.processOutboxMessages();
    }, 2000);
  }

  private async processOutboxMessages() {
    if (this.isShuttingDown) return;

    try {
      // Fetch up to 50 messages using SELECT FOR UPDATE SKIP LOCKED
      const now = new Date();
      const messages = await this.outboxRepository.fetchDueBatch(50, now);

      if (messages.length === 0) {
        return;
      }

      this.logger.log(`Processing ${messages.length} outbox messages...`);

      for (const msg of messages) {
        try {
          // Use aggregateId as MessageGroupId to guarantee order per Wallet/Transaction
          await this.sqsPublisher.publish(msg.aggregateId, msg.id, msg.payload);

          msg.markPublished(new Date());
          await this.outboxRepository.markPublished(msg);
        } catch (error: any) {
          this.logger.error(`Failed to publish message ${msg.id}: ${error.message}`);
          msg.scheduleRetry(new Date());
          await this.outboxRepository.scheduleRetry(msg);
        }
      }
    } catch (error: any) {
      this.logger.error(`Error in outbox polling loop: ${error.message}`, error.stack);
    }
  }
}
