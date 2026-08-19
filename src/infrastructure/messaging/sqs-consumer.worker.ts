import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown, Inject } from '@nestjs/common';
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { ProcessWagerTransactionUseCase } from '../../application/use-cases/process-wager-transaction.use-case';
import { INBOX_REPOSITORY } from '../../application/ports/inbox-repository.port';
import type { InboxRepositoryPort } from '../../application/ports/inbox-repository.port';
import { InboxMessage } from '../../domain/messaging/inbox-message';
import { CanonicalJsonHasher } from '../hashing/canonical-json-hasher';

@Injectable()
export class SqsConsumerWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly sqsClient: SQSClient;
  private readonly logger = new Logger(SqsConsumerWorker.name);
  private isShuttingDown = false;
  private isPolling = false;
  private readonly queueUrl =
    process.env.SQS_WAGER_TRANSACTIONS_QUEUE_URL ||
    process.env.AWS_SQS_INGRESS_QUEUE_URL ||
    'http://localhost:4566/000000000000/wager-transactions.fifo';

  constructor(
    private readonly processWagerUseCase: ProcessWagerTransactionUseCase,
    @Inject(INBOX_REPOSITORY)
    private readonly inboxRepository: InboxRepositoryPort,
    private readonly hasher: CanonicalJsonHasher,
  ) {
    this.sqsClient = new SQSClient({
      region: process.env.AWS_REGION || 'us-east-1',
      endpoint: process.env.AWS_SQS_ENDPOINT || 'http://localhost:4566',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
      },
    });
  }

  onApplicationBootstrap() {
    this.logger.log(`Starting SQS Consumer Worker listening on ${this.queueUrl}...`);
    this.startPolling();
  }

  onApplicationShutdown() {
    this.logger.log('Shutting down SQS Consumer Worker...');
    this.isShuttingDown = true;
  }

  private startPolling() {
    if (this.isPolling) return;
    this.isPolling = true;

    // Fire and forget loop
    (async () => {
      while (!this.isShuttingDown) {
        try {
          await this.pollMessages();
        } catch (error: any) {
          this.logger.error(`Error in SQS polling loop: ${error.message}`, error.stack);
          await new Promise((resolve) => setTimeout(resolve, 5000)); // Backoff
        }
      }
      this.isPolling = false;
    })();
  }

  private async pollMessages() {
    const command = new ReceiveMessageCommand({
      QueueUrl: this.queueUrl,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 20, // Long polling
      AttributeNames: ['All'],
      MessageAttributeNames: ['All'],
    });

    const response = await this.sqsClient.send(command);

    if (!response.Messages || response.Messages.length === 0) {
      return;
    }

    for (const message of response.Messages) {
      await this.processMessage(message);
    }
  }

  private async processMessage(message: any) {
    const messageId = message.MessageId!;
    try {
      // 1. Parse Payload
      const envelope = JSON.parse(message.Body!);
      // Support both envelope format { data: { ... } } and direct payload
      const payload = envelope.data || envelope;
      const payloadHash = this.hasher.hashWagerPayload(payload);

      // 2. Check Inbox for idempotency (at consumer level, independent of UseCase)
      const consumerName = 'WagerTransactionConsumer';
      const existingInbox = await this.inboxRepository.findByKey(consumerName, messageId);
      if (existingInbox && existingInbox.isProcessed()) {
        this.logger.log(`Message ${messageId} already processed (Inbox hit). Skipping.`);
        await this.deleteMessage(message.ReceiptHandle!);
        return;
      }

      const inboxMsg = existingInbox || InboxMessage.receive({
        messageId,
        consumerName,
        payloadHash,
        receivedAt: new Date(),
      });

      // 3. Process Wager
      try {
        await this.processWagerUseCase.execute({
          providerId: payload.providerId,
          externalTransactionId: payload.externalTransactionId,
          idempotencyKey: payload.idempotencyKey || `${payload.providerId}:${payload.externalTransactionId}`,
          playerId: payload.playerId,
          walletId: payload.walletId,
          roundId: payload.roundId,
          gameId: payload.gameId,
          kind: payload.kind,
          money: payload.money,
          referenceExternalTransactionId: payload.referenceExternalTransactionId,
        });

        // 4. Mark Inbox Processed
        inboxMsg.markProcessed(new Date());
        if (existingInbox) {
          await this.inboxRepository.update(inboxMsg);
        } else {
          await this.inboxRepository.create(inboxMsg);
        }

        // 5. Delete from SQS
        await this.deleteMessage(message.ReceiptHandle!);
      } catch (useCaseError: any) {
        if (useCaseError.name === 'DomainError') {
          this.logger.error(`Domain error processing message ${messageId}: ${useCaseError.message}`);
          // Known domain violations (e.g. duplicate, invalid format) shouldn't be retried
          await this.deleteMessage(message.ReceiptHandle!);
        } else {
          throw useCaseError;
        }
      }
    } catch (err: any) {
      this.logger.error(`Failed to process message ${messageId}: ${err.message}`, err.stack);
      // Let visibility timeout expire so message returns to queue / goes to DLQ after max receives
    }
  }

  private async deleteMessage(receiptHandle: string) {
    const command = new DeleteMessageCommand({
      QueueUrl: this.queueUrl,
      ReceiptHandle: receiptHandle,
    });
    await this.sqsClient.send(command);
  }
}
