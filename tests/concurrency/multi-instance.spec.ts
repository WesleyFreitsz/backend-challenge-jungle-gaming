import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Test, TestingModule } from '@nestjs/testing';
import { ApplicationModule } from '../../src/application/application.module';
import { CreateWalletUseCase } from '../../src/application/use-cases/create-wallet.use-case';
import { ProcessWagerTransactionUseCase } from '../../src/application/use-cases/process-wager-transaction.use-case';
import { WagerTransactionKind } from '../../src/domain/wagering/wager-transaction-kind.enum';
import { WagerTransactionStatus } from '../../src/domain/wagering/wager-transaction-status.enum';
import { MikroORM } from '@mikro-orm/postgresql';
import { v4 as uuidv4 } from 'uuid';
import Decimal from 'decimal.js';

describe('Concurrency: Multi-Instance / Multi-Worker Emulation', () => {
  let app: TestingModule;
  let createWalletUseCase: CreateWalletUseCase;
  let orm: MikroORM;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [ApplicationModule],
    }).compile();

    createWalletUseCase = app.get(CreateWalletUseCase);
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

  it('should support >= 3 concurrent isolated instances operating on the same wallet with exact ledger balance reconciliation', async () => {
    const playerId = `player-multi-inst-${uuidv4().substring(0, 8)}`;
    const { id: walletId } = await createWalletUseCase.execute({
      playerId,
      currency: 'BRL',
      initialBalanceAmount: '300.00',
    });

    // Create 3 independent NestJS testing modules representing 3 distinct node processes/instances
    const instance1 = await Test.createTestingModule({ imports: [ApplicationModule] }).compile();
    const instance2 = await Test.createTestingModule({ imports: [ApplicationModule] }).compile();
    const instance3 = await Test.createTestingModule({ imports: [ApplicationModule] }).compile();

    const worker1UseCase = instance1.get(ProcessWagerTransactionUseCase);
    const worker2UseCase = instance2.get(ProcessWagerTransactionUseCase);
    const worker3UseCase = instance3.get(ProcessWagerTransactionUseCase);

    // Each instance executes 10 operations concurrently (total 30 operations across 3 instances)
    const runWorker = (useCase: ProcessWagerTransactionUseCase, workerIndex: number) => {
      return Array.from({ length: 10 }).map((_, i) =>
        useCase.execute({
          providerId: `PROVIDER_INST_${workerIndex}`,
          externalTransactionId: `inst-${workerIndex}-tx-${i}-${uuidv4()}`,
          idempotencyKey: `idem-inst-${workerIndex}-${i}-${uuidv4()}`,
          playerId,
          walletId,
          roundId: `round-inst-${workerIndex}-${i}`,
          gameId: 'fortune-chimp',
          kind: i % 2 === 0 ? WagerTransactionKind.Bet : WagerTransactionKind.Win,
          money: { amount: '10.00', currency: 'BRL' },
        }),
      );
    };

    const allOperations = [
      ...runWorker(worker1UseCase, 1),
      ...runWorker(worker2UseCase, 2),
      ...runWorker(worker3UseCase, 3),
    ];

    const results = await Promise.all(allOperations);
    expect(results.length).toBe(30);

    // Close instance ORMs
    await instance1.get(MikroORM).close(true);
    await instance2.get(MikroORM).close(true);
    await instance3.get(MikroORM).close(true);

    // Perform audit reconciliation from the primary database connection
    const em = orm.em.fork();
    const conn = em.getConnection();

    const [walletRow] = await conn.execute(`SELECT balance_amount, version FROM wallets WHERE id = ?`, [walletId]);
    const ledgerRows = await conn.execute(
      `SELECT direction, amount FROM wallet_ledger_entries WHERE wallet_id = ? ORDER BY created_at ASC`,
      [walletId],
    );

    // Reconcile total balance strictly using ledger entries
    let computedBalance = new Decimal('0.00');
    for (const entry of ledgerRows) {
      if (entry.direction === 'CREDIT') {
        computedBalance = computedBalance.plus(new Decimal(entry.amount));
      } else if (entry.direction === 'DEBIT') {
        computedBalance = computedBalance.minus(new Decimal(entry.amount));
      }
    }

    // Ledger sum must EXACTLY equal wallet balance in DB
    expect(walletRow.balance_amount).toBe(computedBalance.toFixed(2));
    expect(new Decimal(walletRow.balance_amount).gte(0)).toBe(true);
  });
});
