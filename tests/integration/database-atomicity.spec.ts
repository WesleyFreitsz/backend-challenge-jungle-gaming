import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Test, TestingModule } from '@nestjs/testing';
import { ApplicationModule } from '../../src/application/application.module';
import { CreateWalletUseCase } from '../../src/application/use-cases/create-wallet.use-case';
import { ProcessWagerTransactionUseCase } from '../../src/application/use-cases/process-wager-transaction.use-case';
import { WagerTransactionKind } from '../../src/domain/wagering/wager-transaction-kind.enum';
import { WagerTransactionStatus } from '../../src/domain/wagering/wager-transaction-status.enum';
import { MikroORM } from '@mikro-orm/postgresql';
import { v4 as uuidv4 } from 'uuid';

describe('Integration: Database Atomicity & Constraints', () => {
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

  it('should atomically persist wallet, opening transaction, ledger entry, and outbox messages on wallet creation', async () => {
    const playerId = `player-atomicity-${uuidv4().substring(0, 8)}`;
    const currency = 'BRL';

    const walletResult = await createWalletUseCase.execute({
      playerId,
      currency,
      initialBalanceAmount: '500.00',
    });

    const em = orm.em.fork();
    const conn = em.getConnection();

    // Verify wallet in DB
    const [walletRow] = await conn.execute(`SELECT * FROM wallets WHERE id = ?`, [walletResult.id]);
    expect(walletRow).toBeDefined();
    expect(walletRow.balance_amount).toBe('500.00');
    expect(walletRow.version).toBe(1);

    // Verify opening transaction in DB
    const txRows = await conn.execute(`SELECT * FROM wager_transactions WHERE wallet_id = ?`, [walletResult.id]);
    expect(txRows.length).toBe(1);
    expect(txRows[0].kind).toBe('OPENING');
    expect(txRows[0].status).toBe('PROCESSED');

    // Verify ledger entry in DB
    const ledgerRows = await conn.execute(`SELECT * FROM wallet_ledger_entries WHERE wallet_id = ?`, [walletResult.id]);
    expect(ledgerRows.length).toBe(1);
    expect(ledgerRows[0].direction).toBe('CREDIT');
    expect(ledgerRows[0].amount).toBe('500.00');
    expect(ledgerRows[0].balance_after_amount).toBe('500.00');

    // Verify outbox messages enqueued
    const outboxRows = await conn.execute(
      `SELECT * FROM outbox_messages WHERE aggregate_id = ? OR aggregate_id = ?`,
      [walletResult.id, txRows[0].id],
    );
    expect(outboxRows.length).toBe(2);
  });

  it('should enforce immutable ledger trigger (prevent UPDATE/DELETE on wallet_ledger_entries)', async () => {
    const playerId = `player-immutable-${uuidv4().substring(0, 8)}`;
    const { id: walletId } = await createWalletUseCase.execute({
      playerId,
      currency: 'BRL',
      initialBalanceAmount: '100.00',
    });

    const em = orm.em.fork();
    const conn = em.getConnection();

    const [entry] = await conn.execute(`SELECT id FROM wallet_ledger_entries WHERE wallet_id = ?`, [walletId]);
    expect(entry).toBeDefined();

    // Attempting UPDATE on ledger should fail due to database trigger prevent_ledger_mutation
    let updateFailed = false;
    try {
      await conn.execute(`UPDATE wallet_ledger_entries SET amount = '999.00' WHERE id = ?`, [entry.id]);
    } catch {
      updateFailed = true;
    }
    expect(updateFailed).toBe(true);

    // Attempting DELETE on ledger should fail due to database trigger prevent_ledger_mutation
    let deleteFailed = false;
    try {
      await conn.execute(`DELETE FROM wallet_ledger_entries WHERE id = ?`, [entry.id]);
    } catch {
      deleteFailed = true;
    }
    expect(deleteFailed).toBe(true);
  });

  it('should enforce database check constraint chk_wallets_balance_non_negative', async () => {
    const em = orm.em.fork();
    const conn = em.getConnection();

    let negativeBalanceFailed = false;
    try {
      await conn.execute(
        `INSERT INTO wallets (id, player_id, currency, balance_amount, version, created_at, updated_at) 
         VALUES (?, ?, ?, ?, 1, NOW(), NOW())`,
        [uuidv4(), `player-neg-${uuidv4()}`, 'BRL', '-50.00'],
      );
    } catch {
      negativeBalanceFailed = true;
    }
    expect(negativeBalanceFailed).toBe(true);
  });

  it('should roll back completely on transaction rejection leaving no orphan balance alterations or ledger entries', async () => {
    const playerId = `player-rollback-${uuidv4().substring(0, 8)}`;
    const { id: walletId } = await createWalletUseCase.execute({
      playerId,
      currency: 'BRL',
      initialBalanceAmount: '50.00',
    });

    // Submit BET for 100.00 against 50.00 balance
    const result = await processWagerUseCase.execute({
      providerId: 'TEST_PROVIDER',
      externalTransactionId: `tx-overflow-${uuidv4()}`,
      idempotencyKey: `idem-overflow-${uuidv4()}`,
      playerId,
      walletId,
      roundId: 'round-overflow',
      gameId: 'fortune-chimp',
      kind: WagerTransactionKind.Bet,
      money: { amount: '100.00', currency: 'BRL' },
    });

    expect(result.status).toBe(WagerTransactionStatus.Rejected);

    const em = orm.em.fork();
    const conn = em.getConnection();

    // Wallet balance should remain untouched (50.00)
    const [walletRow] = await conn.execute(`SELECT balance_amount, version FROM wallets WHERE id = ?`, [walletId]);
    expect(walletRow.balance_amount).toBe('50.00');
    expect(walletRow.version).toBe(1);

    // Ledger should ONLY contain the 1 OPENING entry (no debit entry created for rejected bet)
    const ledgerRows = await conn.execute(`SELECT * FROM wallet_ledger_entries WHERE wallet_id = ?`, [walletId]);
    expect(ledgerRows.length).toBe(1);
    expect(ledgerRows[0].direction).toBe('CREDIT');
  });
});
