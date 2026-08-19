import { Injectable, Logger } from '@nestjs/common';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

@Injectable()
export class SqsPublisherService {
  private readonly sqsClient: SQSClient;
  private readonly logger = new Logger(SqsPublisherService.name);
  private readonly eventsQueueUrl =
    process.env.SQS_EVENTS_QUEUE_URL ||
    process.env.AWS_SQS_EVENTS_QUEUE_URL ||
    'http://localhost:4566/000000000000/wager-transaction-events.fifo';

  constructor() {
    this.sqsClient = new SQSClient({
      region: process.env.AWS_REGION || 'us-east-1',
      endpoint: process.env.AWS_SQS_ENDPOINT || 'http://localhost:4566',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
      },
    });
  }

  async publish(messageGroupId: string, deduplicationId: string, payload: any): Promise<void> {
    try {
      const command = new SendMessageCommand({
        QueueUrl: this.eventsQueueUrl,
        MessageGroupId: messageGroupId, // Wallet ID to preserve order per wallet
        MessageDeduplicationId: deduplicationId, // Outbox Message ID
        MessageBody: JSON.stringify(payload),
      });

      await this.sqsClient.send(command);
    } catch (error: any) {
      this.logger.error(`Failed to publish message to SQS: ${error.message}`, error.stack);
      throw error;
    }
  }
}
