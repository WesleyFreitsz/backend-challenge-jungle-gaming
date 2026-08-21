import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Test, TestingModule } from '@nestjs/testing';
import { ApplicationModule } from '../../src/application/application.module';
import { CreateWalletUseCase } from '../../src/application/use-cases/create-wallet.use-case';
import { ProcessWagerTransactionUseCase } from '../../src/application/use-cases/process-wager-transaction.use-case';
import { WagerTransactionKind } from '../../src/domain/wagering/wager-transaction-kind.enum';
import { WagerTransactionStatus } from '../../src/domain/wagering/wager-transaction-status.enum';
import { FailureCode } from '../../src/domain/wagering/failure-code.enum';
import { MikroORM } from '@mikro-orm/postgresql';
import { v4 as uuidv4 } from 'uuid';

describe('Concurrency: Wager Processor', () => {
  let app: TestingModule;
  let createWalletUseCase: CreateWalletUseCase;
  let processWagerUseCase: ProcessWagerTransactionUseCase;
  let orm: MikroORM;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [ApplicationModule],
    }).compile();

    createWalletUseCase = app.get(CreateWalletUseCase);
    processWagerUseCase = app.get(ProcessWagerTransactionUseCase);
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

  it('mandatory scenario: initial balance 100 BRL, two simultaneous 80 BRL bets', async () => {
    const playerId = `player-${uuidv4()}`;
    const currency = 'BRL';

    // 1. Create wallet with 100 BRL opening balance
    const { id: walletId } = await createWalletUseCase.execute({
      playerId,
      currency,
      initialBalanceAmount: '100.00',
    });

    const providerId = 'TEST_PROVIDER';
    const roundId = 'round-1';
    const gameId = 'game-1';

    // 2. Dispatch two 80 BRL bets concurrently
    const bet1 = processWagerUseCase.execute({
      providerId,
      externalTransactionId: `bet-${uuidv4()}`,
      idempotencyKey: `idem-${uuidv4()}`,
      playerId,
      walletId,
      roundId,
      gameId,
      kind: WagerTransactionKind.Bet,
      money: { amount: '80.00', currency },
    });

    const bet2 = processWagerUseCase.execute({
      providerId,
      externalTransactionId: `bet-${uuidv4()}`,
      idempotencyKey: `idem-${uuidv4()}`,
      playerId,
      walletId,
      roundId,
      gameId,
      kind: WagerTransactionKind.Bet,
      money: { amount: '80.00', currency },
    });

    const results = await Promise.allSettled([bet1, bet2]);

    // 3. Evaluate results
    const fulfilled = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];

    expect(fulfilled.length).toBe(2);
    const processed = fulfilled.filter((r) => r.value.status === WagerTransactionStatus.Processed);
    const rejected = fulfilled.filter((r) => r.value.status === WagerTransactionStatus.Rejected);

    // Exactly 1 must be PROCESSED and 1 must be REJECTED (InsufficientFunds)
    expect(processed.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(rejected[0].value.failureCode).toBe(FailureCode.InsufficientFunds);

    // Final balance must be exactly 20.00 BRL
    expect(processed[0].value.balance?.amount).toBe('20.00');

    // Verify ledger in PostgreSQL
    const em = orm.em.fork();
    const ledgerEntries = await em.getConnection().execute(
      `SELECT * FROM wallet_ledger_entries WHERE wallet_id = ? ORDER BY created_at ASC`,
      [walletId],
    );

    // 1 OPENING credit entry (100.00) + 1 BET debit entry (80.00)
    expect(ledgerEntries.length).toBe(2);
    expect(ledgerEntries[1].direction).toBe('DEBIT');
    expect(ledgerEntries[1].amount).toBe('80.00');
  });

  it('50 parallel bets of 2 BRL against 100 BRL balance (all 50 should succeed)', async () => {
    const playerId = `player-${uuidv4()}`;
    const { id: walletId } = await createWalletUseCase.execute({
      playerId,
      currency: 'BRL',
      initialBalanceAmount: '100.00',
    });

    const promises = Array.from({ length: 50 }).map(() =>
      processWagerUseCase.execute({
        providerId: 'TEST_PROVIDER',
        externalTransactionId: `bulk-bet-${uuidv4()}`,
        idempotencyKey: `bulk-idem-${uuidv4()}`,
        playerId,
        walletId,
        roundId: 'bulk-round',
        gameId: 'bulk-game',
        kind: WagerTransactionKind.Bet,
        money: { amount: '2.00', currency: 'BRL' },
      }),
    );

    const results = await Promise.all(promises);
    const processed = results.filter((r) => r.status === WagerTransactionStatus.Processed);
    expect(processed.length).toBe(50);

    // Verify final balance via DB
    const em = orm.em.fork();
    const [{ balance_amount }] = await em.getConnection().execute(
      `SELECT balance_amount FROM wallets WHERE id = ?`,
      [walletId],
    );
    expect(balance_amount).toBe('0.00');
  });

  it('mandatory scenario: identical bet sent 50 times in parallel (exact same idempotency key) -> exactly 1 debit and 49 idempotent replays', async () => {
    const playerId = `player-idem-50-${uuidv4().substring(0, 8)}`;
    const { id: walletId } = await createWalletUseCase.execute({
      playerId,
      currency: 'BRL',
      initialBalanceAmount: '100.00',
    });

    const sharedIdempotencyKey = `idem-race-${uuidv4()}`;
    const sharedExternalTxId = `ext-race-${uuidv4()}`;
    const sharedPayload = {
      providerId: 'CONCURRENT_PROVIDER',
      externalTransactionId: sharedExternalTxId,
      idempotencyKey: sharedIdempotencyKey,
      playerId,
      walletId,
      roundId: 'round-race',
      gameId: 'fortune-chimp',
      kind: WagerTransactionKind.Bet,
      money: { amount: '25.00', currency: 'BRL' },
    };

    // Dispatch 50 identical requests in parallel at the exact same moment
    const promises = Array.from({ length: 50 }).map(() =>
      processWagerUseCase.execute(sharedPayload),
    );

    const results = await Promise.all(promises);

    // All 50 must resolve successfully with PROCESSED status
    expect(results.length).toBe(50);
    results.forEach((res) => {
      expect(res.status).toBe(WagerTransactionStatus.Processed);
      expect(res.balance?.amount).toBe('75.00');
    });

    // Exactly 1 request is the original processing, and 49 are idempotent replays
    const original = results.filter((r) => !r.idempotentReplay);
    const replays = results.filter((r) => r.idempotentReplay);
    expect(original.length).toBe(1);
    expect(replays.length).toBe(49);

    // Verify database state: exactly 1 debit ledger entry and balance 75.00
    const em = orm.em.fork();
    const [walletRow] = await em.getConnection().execute(
      `SELECT balance_amount, version FROM wallets WHERE id = ?`,
      [walletId],
    );
    expect(walletRow.balance_amount).toBe('75.00');
    expect(walletRow.version).toBe(2); // 1 (opening) + 1 (debit)

    const ledgerRows = await em.getConnection().execute(
      `SELECT * FROM wallet_ledger_entries WHERE wallet_id = ?`,
      [walletId],
    );
    // 1 OPENING + 1 BET (Total 2)
    expect(ledgerRows.length).toBe(2);
  });

  it('should process distinct wallets in parallel without cross-wallet lock contention', async () => {
    // Create 10 distinct wallets with 50 BRL each
    const wallets = await Promise.all(
      Array.from({ length: 10 }).map((_, i) =>
        createWalletUseCase.execute({
          playerId: `parallel-player-${i}-${uuidv4().substring(0, 6)}`,
          currency: 'BRL',
          initialBalanceAmount: '50.00',
        }),
      ),
    );

    // Execute 1 bet of 10 BRL on each of the 10 wallets simultaneously
    const betPromises = wallets.map((w) =>
      processWagerUseCase.execute({
        providerId: 'PARALLEL_PROVIDER',
        externalTransactionId: `bet-${uuidv4()}`,
        idempotencyKey: `idem-${uuidv4()}`,
        playerId: w.playerId,
        walletId: w.id,
        roundId: 'round-parallel',
        gameId: 'fortune-chimp',
        kind: WagerTransactionKind.Bet,
        money: { amount: '10.00', currency: 'BRL' },
      }),
    );

    const results = await Promise.all(betPromises);
    expect(results.length).toBe(10);
    results.forEach((res) => {
      expect(res.status).toBe(WagerTransactionStatus.Processed);
      expect(res.balance?.amount).toBe('40.00');
    });
  });
});
