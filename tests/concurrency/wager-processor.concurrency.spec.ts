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

  it('cenário obrigatório: saldo 100 BRL, duas apostas de 80 BRL simultâneas', async () => {
    const playerId = `player-${uuidv4()}`;
    const currency = 'BRL';

    // 1. Criar carteira com 100 BRL
    const { id: walletId } = await createWalletUseCase.execute({
      playerId,
      currency,
      initialBalanceAmount: '100.00',
    });

    const providerId = 'TEST_PROVIDER';
    const roundId = 'round-1';
    const gameId = 'game-1';

    // 2. Disparar duas apostas de 80 BRL EXATAMENTE ao mesmo tempo
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

    // 3. Analisar resultados
    const fulfilled = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];

    expect(fulfilled.length).toBe(2);
    const processed = fulfilled.filter((r) => r.value.status === WagerTransactionStatus.Processed);
    const rejected = fulfilled.filter((r) => r.value.status === WagerTransactionStatus.Rejected);

    // Exatamente 1 deve processar, e 1 deve falhar por falta de saldo
    expect(processed.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(rejected[0].value.failureCode).toBe(FailureCode.InsufficientFunds);

    // Saldo final deve ser exatamente 20.00
    expect(processed[0].value.balance?.amount).toBe('20.00');

    // Verificar ledger no PostgreSQL
    const em = orm.em.fork();
    const ledgerEntries = await em.getConnection().execute(
      `SELECT * FROM wallet_ledger_entries WHERE wallet_id = ? ORDER BY created_at ASC`,
      [walletId],
    );

    // 1 de OPENING (100) + 1 de BET DEBIT (80)
    expect(ledgerEntries.length).toBe(2);
    expect(ledgerEntries[1].direction).toBe('DEBIT');
    expect(ledgerEntries[1].amount).toBe('80.00');
  });

  it('50 apostas paralelas de 2 BRL com saldo 100 BRL (deve aceitar todas)', async () => {
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

    // Conferir saldo final via DB
    const em = orm.em.fork();
    const [{ balance_amount }] = await em.getConnection().execute(
      `SELECT balance_amount FROM wallets WHERE id = ?`,
      [walletId],
    );
    expect(Number(balance_amount)).toBe(0);
  });
});
