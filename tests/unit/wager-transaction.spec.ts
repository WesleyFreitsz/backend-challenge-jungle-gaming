import { describe, it, expect } from 'bun:test';
import { WagerTransaction } from '../../src/domain/wagering/wager-transaction';
import { WagerTransactionKind } from '../../src/domain/wagering/wager-transaction-kind.enum';
import { WagerTransactionStatus } from '../../src/domain/wagering/wager-transaction-status.enum';
import { LedgerDirection } from '../../src/domain/wallet/ledger-direction.enum';
import { FailureCode } from '../../src/domain/wagering/failure-code.enum';
import { Money } from '../../src/domain/money/money';
import { ReferenceRequiredError } from '../../src/domain/wagering/exceptions/reference-required.error';
import { InvalidTransactionStateError } from '../../src/domain/wagering/exceptions/invalid-transaction-state.error';

describe('WagerTransaction', () => {
  const commonProps = {
    id: 'tx-1',
    providerId: 'prov-1',
    externalTransactionId: 'ext-1',
    idempotencyKey: 'idem-1',
    payloadHash: 'hash-1',
    walletId: 'wal-1',
    playerId: 'play-1',
    roundId: 'round-1',
    gameId: 'game-1',
    money: Money.from({ amount: '10.00', currency: 'BRL' }),
  };

  describe('Creation', () => {
    it('creates a BET transaction (status PENDING, no reference required)', () => {
      const tx = WagerTransaction.create({
        ...commonProps,
        kind: WagerTransactionKind.Bet,
      });

      expect(tx.status).toBe(WagerTransactionStatus.Pending);
      expect(tx.requiresReference()).toBeFalse();
      expect(tx.kind).toBe(WagerTransactionKind.Bet);
      expect(tx.affectsBalance()).toBeTrue();
    });

    it('creates a WIN transaction', () => {
      const tx = WagerTransaction.create({
        ...commonProps,
        kind: WagerTransactionKind.Win,
        referenceExternalTransactionId: 'ext-bet',
      });

      expect(tx.status).toBe(WagerTransactionStatus.Pending);
      expect(tx.requiresReference()).toBeFalse();
      expect(tx.kind).toBe(WagerTransactionKind.Win);
      expect(tx.affectsBalance()).toBeTrue();
    });

    it('creates a LOSS transaction', () => {
      const tx = WagerTransaction.create({
        ...commonProps,
        kind: WagerTransactionKind.Loss,
      });

      expect(tx.status).toBe(WagerTransactionStatus.Pending);
      expect(tx.requiresReference()).toBeFalse();
      expect(tx.affectsBalance()).toBeFalse();
    });

    it('creates a REFUND transaction (reference REQUIRED)', () => {
      const tx = WagerTransaction.create({
        ...commonProps,
        kind: WagerTransactionKind.Refund,
        referenceExternalTransactionId: 'ext-bet',
      });

      expect(tx.status).toBe(WagerTransactionStatus.Pending);
      expect(tx.requiresReference()).toBeTrue();
    });

    it('creates a ROLLBACK transaction (reference REQUIRED)', () => {
      const tx = WagerTransaction.create({
        ...commonProps,
        kind: WagerTransactionKind.Rollback,
        referenceExternalTransactionId: 'ext-bet',
      });

      expect(tx.status).toBe(WagerTransactionStatus.Pending);
      expect(tx.requiresReference()).toBeTrue();
    });

    it('rejects REFUND without reference', () => {
      expect(() => {
        WagerTransaction.create({
          ...commonProps,
          kind: WagerTransactionKind.Refund,
        });
      }).toThrow(ReferenceRequiredError);
    });

    it('rejects ROLLBACK without reference', () => {
      expect(() => {
        WagerTransaction.create({
          ...commonProps,
          kind: WagerTransactionKind.Rollback,
        });
      }).toThrow(ReferenceRequiredError);
    });
  });

  describe('State Machine transitions', () => {
    it('markProcessed from PENDING -> PROCESSED', () => {
      const tx = WagerTransaction.create({
        ...commonProps,
        kind: WagerTransactionKind.Bet,
      });
      const now = new Date();
      tx.markProcessed(undefined, now);
      expect(tx.status).toBe(WagerTransactionStatus.Processed);
      expect(tx.processedAt).toBe(now);
      expect(tx.isTerminal()).toBeTrue();
    });

    it('markProcessed from PENDING_REFERENCE -> PROCESSED', () => {
      const tx = WagerTransaction.create({
        ...commonProps,
        kind: WagerTransactionKind.Bet,
      });
      tx.markPendingReference();
      tx.markProcessed('ref-tx-1', new Date());
      expect(tx.status).toBe(WagerTransactionStatus.Processed);
      expect(tx.referenceTransactionId).toBe('ref-tx-1');
    });

    it('markPendingReference from PENDING -> PENDING_REFERENCE', () => {
      const tx = WagerTransaction.create({
        ...commonProps,
        kind: WagerTransactionKind.Bet,
      });
      tx.markPendingReference();
      expect(tx.status).toBe(WagerTransactionStatus.PendingReference);
      expect(tx.isTerminal()).toBeFalse();
    });

    it('reject from PENDING -> REJECTED', () => {
      const tx = WagerTransaction.create({
        ...commonProps,
        kind: WagerTransactionKind.Bet,
      });
      tx.reject(FailureCode.InsufficientFunds);
      expect(tx.status).toBe(WagerTransactionStatus.Rejected);
      expect(tx.failureCode).toBe(FailureCode.InsufficientFunds);
      expect(tx.isTerminal()).toBeTrue();
    });

    it('fail from PENDING -> FAILED', () => {
      const tx = WagerTransaction.create({
        ...commonProps,
        kind: WagerTransactionKind.Bet,
      });
      tx.fail(FailureCode.ProviderMismatch);
      expect(tx.status).toBe(WagerTransactionStatus.Failed);
      expect(tx.failureCode).toBe(FailureCode.ProviderMismatch);
      expect(tx.isTerminal()).toBeTrue();
    });

    it('Reject transition from PROCESSED throws', () => {
      const tx = WagerTransaction.create({ ...commonProps, kind: WagerTransactionKind.Bet });
      tx.markProcessed(undefined, new Date());
      expect(() => tx.reject(FailureCode.InsufficientFunds)).toThrow(InvalidTransactionStateError);
    });

    it('Reject transition from REJECTED throws', () => {
      const tx = WagerTransaction.create({ ...commonProps, kind: WagerTransactionKind.Bet });
      tx.reject(FailureCode.InsufficientFunds);
      expect(() => tx.fail(FailureCode.ProviderMismatch)).toThrow(InvalidTransactionStateError);
    });

    it('Reject transition from FAILED throws', () => {
      const tx = WagerTransaction.create({ ...commonProps, kind: WagerTransactionKind.Bet });
      tx.fail(FailureCode.ProviderMismatch);
      expect(() => tx.markProcessed(undefined, new Date())).toThrow(InvalidTransactionStateError);
    });
  });

  describe('Domain queries', () => {
    it('matchesPayload: same hash=true, different=false', () => {
      const tx = WagerTransaction.create({ ...commonProps, kind: WagerTransactionKind.Bet });
      expect(tx.matchesPayload('hash-1')).toBeTrue();
      expect(tx.matchesPayload('hash-2')).toBeFalse();
    });

    it('ledgerDirectionFor: BET=DEBIT, WIN=CREDIT, REFUND=CREDIT, OPENING=CREDIT', () => {
      const bet = WagerTransaction.create({ ...commonProps, kind: WagerTransactionKind.Bet });
      expect(bet.ledgerDirectionFor()).toBe(LedgerDirection.Debit);

      const win = WagerTransaction.create({ ...commonProps, kind: WagerTransactionKind.Win });
      expect(win.ledgerDirectionFor()).toBe(LedgerDirection.Credit);

      const refund = WagerTransaction.create({ ...commonProps, kind: WagerTransactionKind.Refund, referenceExternalTransactionId: 'ext-1' });
      expect(refund.ledgerDirectionFor()).toBe(LedgerDirection.Credit);

      const opening = WagerTransaction.create({ ...commonProps, kind: WagerTransactionKind.Opening });
      expect(opening.ledgerDirectionFor()).toBe(LedgerDirection.Credit);
    });

    it('ledgerDirectionFor ROLLBACK: inverts reference', () => {
      const bet = WagerTransaction.create({ ...commonProps, kind: WagerTransactionKind.Bet });
      const win = WagerTransaction.create({ ...commonProps, kind: WagerTransactionKind.Win });
      
      const rollbackBet = WagerTransaction.create({ ...commonProps, kind: WagerTransactionKind.Rollback, referenceExternalTransactionId: 'ext-1' });
      expect(rollbackBet.ledgerDirectionFor(bet)).toBe(LedgerDirection.Credit);
      
      const rollbackWin = WagerTransaction.create({ ...commonProps, kind: WagerTransactionKind.Rollback, referenceExternalTransactionId: 'ext-1' });
      expect(rollbackWin.ledgerDirectionFor(win)).toBe(LedgerDirection.Debit);
    });
  });
});
