import { describe, it, expect } from 'bun:test';
import { WalletLedgerEntry } from '../../src/domain/wallet/wallet-ledger-entry';
import { Money } from '../../src/domain/money/money';
import { LedgerDirection } from '../../src/domain/wallet/ledger-direction.enum';
import { DomainError } from '../../src/domain/common/domain-error';

describe('WalletLedgerEntry', () => {
  it('should create a valid DEBIT ledger entry (balanceBefore - money = balanceAfter)', () => {
    const money = Money.from({ amount: '20.00', currency: 'BRL' });
    const balanceBefore = Money.from({ amount: '100.00', currency: 'BRL' });
    const balanceAfter = Money.from({ amount: '80.00', currency: 'BRL' });

    const entry = WalletLedgerEntry.create({
      id: 'entry-1',
      walletId: 'wallet-1',
      transactionId: 'txn-1',
      direction: LedgerDirection.Debit,
      money,
      balanceBefore,
      balanceAfter,
      createdAt: new Date(),
    });

    expect(entry.isBalanced()).toBe(true);
    expect(entry.id).toBe('entry-1');
    expect(entry.direction).toBe(LedgerDirection.Debit);
  });

  it('should create a valid CREDIT ledger entry (balanceBefore + money = balanceAfter)', () => {
    const money = Money.from({ amount: '30.00', currency: 'BRL' });
    const balanceBefore = Money.from({ amount: '100.00', currency: 'BRL' });
    const balanceAfter = Money.from({ amount: '130.00', currency: 'BRL' });

    const entry = WalletLedgerEntry.create({
      id: 'entry-2',
      walletId: 'wallet-1',
      transactionId: 'txn-2',
      direction: LedgerDirection.Credit,
      money,
      balanceBefore,
      balanceAfter,
      createdAt: new Date(),
    });

    expect(entry.isBalanced()).toBe(true);
  });

  it('should reject unbalanced DEBIT ledger entries', () => {
    const money = Money.from({ amount: '20.00', currency: 'BRL' });
    const balanceBefore = Money.from({ amount: '100.00', currency: 'BRL' });
    const balanceAfter = Money.from({ amount: '90.00', currency: 'BRL' }); // Incorrect, should be 80.00

    expect(() => {
      WalletLedgerEntry.create({
        id: 'entry-3',
        walletId: 'wallet-1',
        transactionId: 'txn-3',
        direction: LedgerDirection.Debit,
        money,
        balanceBefore,
        balanceAfter,
        createdAt: new Date(),
      });
    }).toThrow(DomainError);
  });

  it('should reject unbalanced CREDIT ledger entries', () => {
    const money = Money.from({ amount: '30.00', currency: 'BRL' });
    const balanceBefore = Money.from({ amount: '100.00', currency: 'BRL' });
    const balanceAfter = Money.from({ amount: '120.00', currency: 'BRL' }); // Incorrect, should be 130.00

    expect(() => {
      WalletLedgerEntry.create({
        id: 'entry-4',
        walletId: 'wallet-1',
        transactionId: 'txn-4',
        direction: LedgerDirection.Credit,
        money,
        balanceBefore,
        balanceAfter,
        createdAt: new Date(),
      });
    }).toThrow(DomainError);
  });

  it('should reject mismatched currency between balance and transaction money', () => {
    const money = Money.from({ amount: '20.00', currency: 'USD' });
    const balanceBefore = Money.from({ amount: '100.00', currency: 'BRL' });
    const balanceAfter = Money.from({ amount: '80.00', currency: 'BRL' });

    expect(() => {
      WalletLedgerEntry.create({
        id: 'entry-5',
        walletId: 'wallet-1',
        transactionId: 'txn-5',
        direction: LedgerDirection.Debit,
        money,
        balanceBefore,
        balanceAfter,
        createdAt: new Date(),
      });
    }).toThrow();
  });

  it('should rehydrate from raw state without revalidation', () => {
    const money = Money.from({ amount: '20.00', currency: 'BRL' });
    const balanceBefore = Money.from({ amount: '100.00', currency: 'BRL' });
    const balanceAfter = Money.from({ amount: '999.00', currency: 'BRL' }); // Intentionally unbalanced for rehydration test

    const entry = WalletLedgerEntry.rehydrate({
      id: 'entry-6',
      walletId: 'wallet-1',
      transactionId: 'txn-6',
      direction: LedgerDirection.Debit,
      money,
      balanceBefore,
      balanceAfter,
      createdAt: new Date(),
    });

    expect(entry.id).toBe('entry-6');
    expect(entry.isBalanced()).toBe(false);
  });
});
