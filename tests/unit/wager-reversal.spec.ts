import { describe, it, expect, beforeEach } from 'bun:test';
import { ProcessWagerTransactionUseCase } from '../../src/application/use-cases/process-wager-transaction.use-case';
import { WagerTransactionKind } from '../../src/domain/wagering/wager-transaction-kind.enum';
import { WagerTransactionStatus } from '../../src/domain/wagering/wager-transaction-status.enum';
import { FailureCode } from '../../src/domain/wagering/failure-code.enum';
import { CanonicalJsonHasher } from '../../src/infrastructure/hashing/canonical-json-hasher';
import { Wallet } from '../../src/domain/wallet/wallet';
import { Money } from '../../src/domain/money/money';
import { WagerTransaction } from '../../src/domain/wagering/wager-transaction';
import { v4 as uuidv4 } from 'uuid';

describe('Wager Reversals & Edge Cases Unit Tests', () => {
  let useCase: ProcessWagerTransactionUseCase;
  let mockUow: any;
  let mockWalletRepo: any;
  let mockWagerRepo: any;
  let mockLedgerRepo: any;
  let mockOutboxRepo: any;
  let hasher: CanonicalJsonHasher;

  let wallet: Wallet;
  let betTx: WagerTransaction;
  let winTx: WagerTransaction;

  const walletId = 'wallet-123';
  const playerId = 'player-123';
  const providerId = 'provider-a';
  const roundId = 'round-999';
  const gameId = 'fortune-chimp';

  beforeEach(() => {
    wallet = Wallet.open({
      id: walletId,
      playerId,
      initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
    });

    betTx = WagerTransaction.create({
      id: uuidv4(),
      providerId,
      externalTransactionId: 'bet-orig-1',
      idempotencyKey: 'idem-bet-1',
      payloadHash: 'hash1',
      walletId,
      playerId,
      roundId,
      gameId,
      kind: WagerTransactionKind.Bet,
      money: Money.from({ amount: '50.00', currency: 'BRL' }),
    });
    betTx.markProcessed(undefined, new Date());

    winTx = WagerTransaction.create({
      id: uuidv4(),
      providerId,
      externalTransactionId: 'win-orig-1',
      idempotencyKey: 'idem-win-1',
      payloadHash: 'hash2',
      walletId,
      playerId,
      roundId,
      gameId,
      kind: WagerTransactionKind.Win,
      money: Money.from({ amount: '150.00', currency: 'BRL' }),
    });
    winTx.markProcessed(betTx.id, new Date());

    mockUow = {
      execute: async (fn: any) => fn(),
    };

    mockWalletRepo = {
      findByIdForUpdate: async (id: string) => (id === walletId ? wallet : null),
      findById: async (id: string) => (id === walletId ? wallet : null),
      update: async () => {},
    };

    const txs: WagerTransaction[] = [betTx, winTx];
    mockWagerRepo = {
      findByIdempotencyKey: async (key: string) => txs.find((t) => t.idempotencyKey === key) || null,
      findByProviderAndExternalId: async (prov: string, extId: string) =>
        txs.find((t) => t.providerId === prov && t.externalTransactionId === extId) || null,
      findProcessedReversalsByReferenceId: async (refId: string) =>
        txs.filter(
          (t) =>
            t.referenceTransactionId === refId &&
            t.status === WagerTransactionStatus.Processed &&
            (t.kind === WagerTransactionKind.Refund || t.kind === WagerTransactionKind.Rollback),
        ),
      create: async (t: WagerTransaction) => {
        txs.push(t);
      },
      update: async (t: WagerTransaction) => {
        const idx = txs.findIndex((x) => x.id === t.id);
        if (idx >= 0) txs[idx] = t;
      },
    };

    mockLedgerRepo = {
      create: async () => {},
    };

    mockOutboxRepo = {
      create: async () => {},
    };

    hasher = new CanonicalJsonHasher();

    useCase = new ProcessWagerTransactionUseCase(
      mockUow,
      mockWalletRepo,
      mockWagerRepo,
      mockLedgerRepo,
      mockOutboxRepo,
      hasher,
    );
  });

  it('deve rejeitar REFUND se a transação referenciada não for BET (ex: referenciando um WIN)', async () => {
    const result = await useCase.execute({
      providerId,
      externalTransactionId: 'refund-invalid-target',
      idempotencyKey: 'idem-ref-invalid',
      playerId,
      walletId,
      roundId,
      gameId,
      kind: WagerTransactionKind.Refund,
      money: { amount: '150.00', currency: 'BRL' },
      referenceExternalTransactionId: winTx.externalTransactionId, // Trying to refund a WIN!
    });

    expect(result.status).toBe(WagerTransactionStatus.Rejected);
    expect(result.failureCode).toBe(FailureCode.RefundOnlyForBet);
  });

  it('deve rejeitar REFUND/ROLLBACK se o valor for diferente da referência (ReversalAmountMismatch)', async () => {
    const result = await useCase.execute({
      providerId,
      externalTransactionId: 'refund-wrong-amount',
      idempotencyKey: 'idem-ref-amt',
      playerId,
      walletId,
      roundId,
      gameId,
      kind: WagerTransactionKind.Refund,
      money: { amount: '20.00', currency: 'BRL' }, // Bet was 50.00
      referenceExternalTransactionId: betTx.externalTransactionId,
    });

    expect(result.status).toBe(WagerTransactionStatus.Rejected);
    expect(result.failureCode).toBe(FailureCode.ReversalAmountMismatch);
  });

  it('deve rejeitar REFUND se o playerId não bater com a referência (PlayerMismatch)', async () => {
    const result = await useCase.execute({
      providerId,
      externalTransactionId: 'refund-diff-player',
      idempotencyKey: 'idem-ref-player',
      playerId: 'other-player',
      walletId,
      roundId,
      gameId,
      kind: WagerTransactionKind.Refund,
      money: { amount: '50.00', currency: 'BRL' },
      referenceExternalTransactionId: betTx.externalTransactionId,
    });

    expect(result.status).toBe(WagerTransactionStatus.Rejected);
    expect(result.failureCode).toBe(FailureCode.PlayerMismatch);
  });

  it('deve rejeitar REFUND se o roundId não bater com a referência (RoundMismatch)', async () => {
    const result = await useCase.execute({
      providerId,
      externalTransactionId: 'refund-diff-round',
      idempotencyKey: 'idem-ref-round',
      playerId,
      walletId,
      roundId: 'round-diff',
      gameId,
      kind: WagerTransactionKind.Refund,
      money: { amount: '50.00', currency: 'BRL' },
      referenceExternalTransactionId: betTx.externalTransactionId,
    });

    expect(result.status).toBe(WagerTransactionStatus.Rejected);
    expect(result.failureCode).toBe(FailureCode.RoundMismatch);
  });

  it('deve rejeitar ROLLBACK com REVERSAL_WOULD_CAUSE_NEGATIVE_BALANCE caso debite mais do que o saldo atual', async () => {
    // Carteira tem 100 BRL. Tentamos fazer ROLLBACK de um WIN de 150 BRL (o que precisaria debitar 150 BRL da carteira).
    const result = await useCase.execute({
      providerId,
      externalTransactionId: 'rollback-win-overflow',
      idempotencyKey: 'idem-rb-win',
      playerId,
      walletId,
      roundId,
      gameId,
      kind: WagerTransactionKind.Rollback,
      money: { amount: '150.00', currency: 'BRL' },
      referenceExternalTransactionId: winTx.externalTransactionId,
    });

    expect(result.status).toBe(WagerTransactionStatus.Rejected);
    expect(result.failureCode).toBe(FailureCode.ReversalWouldCauseNegativeBalance);
  });

  it('deve colocar em PENDING_REFERENCE se a referência não existir ainda', async () => {
    const result = await useCase.execute({
      providerId,
      externalTransactionId: 'refund-early',
      idempotencyKey: 'idem-ref-early',
      playerId,
      walletId,
      roundId,
      gameId,
      kind: WagerTransactionKind.Refund,
      money: { amount: '50.00', currency: 'BRL' },
      referenceExternalTransactionId: 'non-existing-yet',
    });

    expect(result.status).toBe(WagerTransactionStatus.PendingReference);
  });
});
