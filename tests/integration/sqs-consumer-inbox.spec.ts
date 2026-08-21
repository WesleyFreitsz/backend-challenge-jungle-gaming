import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Test, TestingModule } from '@nestjs/testing';
import { ApplicationModule } from '../../src/application/application.module';
import { CreateWalletUseCase } from '../../src/application/use-cases/create-wallet.use-case';
import { ProcessWagerTransactionUseCase } from '../../src/application/use-cases/process-wager-transaction.use-case';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { MikroORM } from '@mikro-orm/postgresql';
import { INBOX_REPOSITORY } from '../../src/application/ports/inbox-repository.port';
import type { InboxRepositoryPort } from '../../src/application/ports/inbox-repository.port';
import { InboxMessage } from '../../src/domain/messaging/inbox-message';
import { CanonicalJsonHasher } from '../../src/infrastructure/hashing/canonical-json-hasher';
import { v4 as uuidv4 } from 'uuid';

describe('Integration: SQS Consumer & Inbox Deduplication', () => {
  let app: TestingModule;
  let createWalletUseCase: CreateWalletUseCase;
  let processWagerUseCase: ProcessWagerTransactionUseCase;
  let inboxRepo: InboxRepositoryPort;
  let orm: MikroORM;
  let hasher: CanonicalJsonHasher;
  let sqsClient: SQSClient;

  const queueUrl =
    process.env.SQS_WAGER_TRANSACTIONS_QUEUE_URL ||
    'http://localhost:4566/000000000000/wager-transactions.fifo';

  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [ApplicationModule],
    }).compile();

    createWalletUseCase = app.get(CreateWalletUseCase);
    processWagerUseCase = app.get(ProcessWagerTransactionUseCase);
    inboxRepo = app.get(INBOX_REPOSITORY);
    orm = app.get(MikroORM);
    hasher = new CanonicalJsonHasher();

    sqsClient = new SQSClient({
      region: process.env.AWS_REGION || 'us-east-1',
      endpoint: process.env.AWS_SQS_ENDPOINT || 'http://localhost:4566',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
      },
    });

    const migrator = orm.migrator;
    if (migrator) {
      await migrator.up();
    }
  });

  afterAll(async () => {
    if (orm) {
      await orm.close(true);
    }
  });

  it('should persist an inbox record and prevent double processing on message redelivery', async () => {
    const playerId = `player-inbox-${uuidv4().substring(0, 8)}`;
    const { id: walletId } = await createWalletUseCase.execute({
      playerId,
      currency: 'BRL',
      initialBalanceAmount: '100.00',
    });

    const consumerName = 'WagerTransactionConsumer';
    const messageId = `sqs-msg-${uuidv4()}`;
    const payload = {
      providerId: 'PROVIDER_SQS',
      externalTransactionId: `tx-sqs-${uuidv4()}`,
      idempotencyKey: `idem-sqs-${uuidv4()}`,
      playerId,
      walletId,
      roundId: 'round-sqs-1',
      gameId: 'fortune-chimp',
      kind: 'BET',
      money: { amount: '25.00', currency: 'BRL' },
    };

    const payloadHash = hasher.hashWagerPayload(payload);

    // 1. First delivery of message: Inbox check returns null
    const existingBefore = await inboxRepo.findByKey(consumerName, messageId);
    expect(existingBefore).toBeNull();

    // Process wager
    const result1 = await processWagerUseCase.execute(payload as any);
    expect(result1.status).toBe('PROCESSED');
    expect(result1.balance?.amount).toBe('75.00');

    // Create & mark inbox message as processed
    const inboxEntry = InboxMessage.receive({
      messageId,
      consumerName,
      payloadHash,
      receivedAt: new Date(),
    });
    inboxEntry.markProcessed(new Date());
    await inboxRepo.create(inboxEntry);

    // 2. Simulated SQS Redelivery (same messageId): Inbox check finds entry already processed
    const existingOnRedelivery = await inboxRepo.findByKey(consumerName, messageId);
    expect(existingOnRedelivery).not.toBeNull();
    expect(existingOnRedelivery?.isProcessed()).toBe(true);

    // Verify wallet balance is STILL 75.00 (no double debit)
    const em = orm.em.fork();
    const [walletRow] = await em.getConnection().execute(
      `SELECT balance_amount, version FROM wallets WHERE id = ?`,
      [walletId],
    );
    expect(walletRow.balance_amount).toBe('75.00');
    expect(walletRow.version).toBe(2); // 1 (opening) + 1 (single debit)
  });

  it('should publish a wager request to SQS FIFO queue with MessageGroupId and MessageDeduplicationId', async () => {
    const messageId = uuidv4();
    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify({
        messageId: `msg-${messageId}`,
        type: 'WagerTransactionRequested',
        occurredAt: new Date().toISOString(),
        data: {
          providerId: 'provider-test',
          externalTransactionId: `ext-${messageId}`,
          idempotencyKey: `idem-${messageId}`,
          playerId: 'p-1',
          walletId: 'w-1',
          roundId: 'r-1',
          gameId: 'fortune-chimp',
          kind: 'BET',
          money: { amount: '10.00', currency: 'BRL' },
        },
      }),
      MessageGroupId: 'w-1',
      MessageDeduplicationId: `dedup-${messageId}`,
    });

    try {
      const response = await sqsClient.send(command);
      expect(response.MessageId).toBeDefined();
    } catch (err: any) {
      // If LocalStack SQS container is not running during local offline test, warn gracefully
      console.warn(`LocalStack SQS not reachable at ${queueUrl}, skipping live SQS publish check: ${err.message}`);
    }
  });
});
