import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Test, TestingModule } from '@nestjs/testing';
import { ApplicationModule } from '../../src/application/application.module';
import { MessagingModule } from '../../src/infrastructure/messaging/messaging.module';
import { CreateWalletUseCase } from '../../src/application/use-cases/create-wallet.use-case';
import { ProcessWagerTransactionUseCase } from '../../src/application/use-cases/process-wager-transaction.use-case';
import { PendingReferenceWorker } from '../../src/infrastructure/messaging/pending-reference.worker';
import { WAGER_TRANSACTION_REPOSITORY } from '../../src/application/ports/wager-transaction-repository.port';
import type { WagerTransactionRepositoryPort } from '../../src/application/ports/wager-transaction-repository.port';
import { WagerTransactionKind } from '../../src/domain/wagering/wager-transaction-kind.enum';
import { WagerTransactionStatus } from '../../src/domain/wagering/wager-transaction-status.enum';
import { FailureCode } from '../../src/domain/wagering/failure-code.enum';
import { MikroORM } from '@mikro-orm/postgresql';
import { v4 as uuidv4 } from 'uuid';

describe('Integration: Out-of-Order Operations & Pending Reference TTL', () => {
  let app: TestingModule;
  let createWalletUseCase: CreateWalletUseCase;
  let processWagerUseCase: ProcessWagerTransactionUseCase;
  let wagerRepo: WagerTransactionRepositoryPort;
  let pendingWorker: PendingReferenceWorker;
  let orm: MikroORM;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [ApplicationModule, MessagingModule],
    }).compile();

    createWalletUseCase = app.get(CreateWalletUseCase);
    processWagerUseCase = app.get(ProcessWagerTransactionUseCase);
    wagerRepo = app.get(WAGER_TRANSACTION_REPOSITORY);
    pendingWorker = app.get(PendingReferenceWorker);
    orm = app.get(MikroORM);

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

  it('should enter PENDING_REFERENCE when REFUND arrives before BET and resolve when BET is processed', async () => {
    const playerId = `player-order-${uuidv4().substring(0, 8)}`;
    const { id: walletId } = await createWalletUseCase.execute({
      playerId,
      currency: 'BRL',
      initialBalanceAmount: '100.00',
    });

    const providerId = 'OUT_OF_ORDER_PROV';
    const betExtTxId = `bet-target-${uuidv4()}`;
    const refundExtTxId = `refund-early-${uuidv4()}`;
    const roundId = `round-order-${uuidv4().substring(0, 6)}`;

    // 1. REFUND arrives first (out-of-order)
    const refundResult = await processWagerUseCase.execute({
      providerId,
      externalTransactionId: refundExtTxId,
      idempotencyKey: `idem-${refundExtTxId}`,
      playerId,
      walletId,
      roundId,
      gameId: 'fortune-chimp',
      kind: WagerTransactionKind.Refund,
      money: { amount: '30.00', currency: 'BRL' },
      referenceExternalTransactionId: betExtTxId,
    });

    expect(refundResult.status).toBe(WagerTransactionStatus.PendingReference);

    // 2. BET arrives afterwards and is processed
    const betResult = await processWagerUseCase.execute({
      providerId,
      externalTransactionId: betExtTxId,
      idempotencyKey: `idem-${betExtTxId}`,
      playerId,
      walletId,
      roundId,
      gameId: 'fortune-chimp',
      kind: WagerTransactionKind.Bet,
      money: { amount: '30.00', currency: 'BRL' },
    });

    expect(betResult.status).toBe(WagerTransactionStatus.Processed);

    // 3. Trigger pending worker resolution cycle
    await (pendingWorker as any).processPendingReferences();

    // 4. Verify that the REFUND transaction is now resolved to PROCESSED
    const resolvedRefund = await wagerRepo.findByProviderAndExternalId(providerId, refundExtTxId);
    expect(resolvedRefund).not.toBeNull();
    expect(resolvedRefund?.status).toBe(WagerTransactionStatus.Processed);

    // Final balance: 100 (initial) - 30 (bet) + 30 (refund) = 100.00
    const em = orm.em.fork();
    const [walletRow] = await em.getConnection().execute(
      `SELECT balance_amount FROM wallets WHERE id = ?`,
      [walletId],
    );
    expect(walletRow.balance_amount).toBe('100.00');
  });

  it('should expire orphaned PENDING_REFERENCE transactions to REJECTED (REFERENCE_NOT_FOUND) after TTL', async () => {
    const playerId = `player-ttl-${uuidv4().substring(0, 8)}`;
    const { id: walletId } = await createWalletUseCase.execute({
      playerId,
      currency: 'BRL',
      initialBalanceAmount: '100.00',
    });

    const providerId = 'TTL_EXPIRE_PROV';
    const orphanRefundExtTxId = `refund-never-ref-${uuidv4()}`;

    // 1. Submit REFUND referencing a non-existent transaction with past date
    const pastDate = new Date(Date.now() - 120000); // 2 minutes ago (exceeds 60s TTL)
    const result = await processWagerUseCase.execute({
      providerId,
      externalTransactionId: orphanRefundExtTxId,
      idempotencyKey: `idem-${orphanRefundExtTxId}`,
      playerId,
      walletId,
      roundId: 'round-never',
      gameId: 'fortune-chimp',
      kind: WagerTransactionKind.Refund,
      money: { amount: '20.00', currency: 'BRL' },
      referenceExternalTransactionId: 'ghost-bet-tx',
      occurredAt: pastDate,
    });

    expect(result.status).toBe(WagerTransactionStatus.PendingReference);

    // 2. Trigger worker resolution cycle
    await (pendingWorker as any).processPendingReferences();

    // 3. Verify it transitioned to REJECTED with ReferenceNotFound
    const expiredTx = await wagerRepo.findByProviderAndExternalId(providerId, orphanRefundExtTxId);
    expect(expiredTx).not.toBeNull();
    expect(expiredTx?.status).toBe(WagerTransactionStatus.Rejected);
    expect(expiredTx?.failureCode).toBe(FailureCode.ReferenceNotFound);
  });
});
