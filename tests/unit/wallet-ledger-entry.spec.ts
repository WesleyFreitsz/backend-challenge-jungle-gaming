import { describe, it, expect } from 'bun:test';
import { WalletLedgerEntry } from '../../src/domain/wallet/wallet-ledger-entry';
import { Money } from '../../src/domain/money/money';
import { LedgerDirection } from '../../src/domain/wallet/ledger-direction.enum';
import { DomainError } from '../../src/domain/common/domain-error';

describe('WalletLedgerEntry', () => {
  it('deve criar com uma entrada de DÉBITO válida (balanceBefore - money = balanceAfter)', () => {
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

  it('deve criar com uma entrada de CRÉDITO válida (balanceBefore + money = balanceAfter)', () => {
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

  it('deve rejeitar entradas desbalanceadas no DÉBITO', () => {
    const money = Money.from({ amount: '20.00', currency: 'BRL' });
    const balanceBefore = Money.from({ amount: '100.00', currency: 'BRL' });
    const balanceAfter = Money.from({ amount: '90.00', currency: 'BRL' }); // Errado, deveria ser 80

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

  it('deve rejeitar entradas desbalanceadas no CRÉDITO', () => {
    const money = Money.from({ amount: '30.00', currency: 'BRL' });
    const balanceBefore = Money.from({ amount: '100.00', currency: 'BRL' });
    const balanceAfter = Money.from({ amount: '120.00', currency: 'BRL' }); // Errado, deveria ser 130

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

  it('deve rejeitar divergência de moeda', () => {
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

  it('deve reidratar a partir do estado sem revalidar (balanceAfter pode ser inválido, apenas reconstrói)', () => {
    const money = Money.from({ amount: '20.00', currency: 'BRL' });
    const balanceBefore = Money.from({ amount: '100.00', currency: 'BRL' });
    const balanceAfter = Money.from({ amount: '999.00', currency: 'BRL' }); // inválido de propósito

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
