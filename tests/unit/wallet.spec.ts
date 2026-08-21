import { describe, it, expect } from 'bun:test';
import { Wallet } from '../../src/domain/wallet/wallet';
import { Money } from '../../src/domain/money/money';
import { InsufficientFundsError } from '../../src/domain/wallet/exceptions/insufficient-funds.error';
import { WalletCurrencyMismatchError } from '../../src/domain/wallet/exceptions/wallet-currency-mismatch.error';

describe('Wallet Aggregate', () => {
  it('should open a wallet with valid non-negative initial balance', () => {
    const initialBalance = Money.from({ amount: '100.00', currency: 'BRL' });
    const wallet = Wallet.open({ id: 'w-1', playerId: 'p-1', initialBalance });

    expect(wallet.id).toBe('w-1');
    expect(wallet.playerId).toBe('p-1');
    expect(wallet.currency).toBe('BRL');
    expect(wallet.balance.equals(initialBalance)).toBe(true);
    expect(wallet.version).toBe(1);
    expect(wallet.createdAt).toBeInstanceOf(Date);
    expect(wallet.updatedAt).toBeInstanceOf(Date);
  });

  it('should open a wallet with zero initial balance', () => {
    const initialBalance = Money.zero('USD');
    const wallet = Wallet.open({ id: 'w-2', playerId: 'p-1', initialBalance });

    expect(wallet.balance.isZero()).toBe(true);
    expect(wallet.currency).toBe('USD');
  });

  it('should reject debit when balance is insufficient', () => {
    const wallet = Wallet.open({ id: 'w-3', playerId: 'p-1', initialBalance: Money.from({ amount: '50.00', currency: 'BRL' }) });
    const debitAmount = Money.from({ amount: '60.00', currency: 'BRL' });

    expect(() => wallet.debit(debitAmount)).toThrow(InsufficientFundsError);
  });

  it('should subtract debit amount and increment aggregate version', () => {
    const wallet = Wallet.open({ id: 'w-4', playerId: 'p-1', initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }) });
    const debitAmount = Money.from({ amount: '40.00', currency: 'BRL' });
    
    wallet.debit(debitAmount);
    
    expect(wallet.balance.equals(Money.from({ amount: '60.00', currency: 'BRL' }))).toBe(true);
    expect(wallet.version).toBe(2);
  });

  it('should allow debiting exact balance leaving zero', () => {
    const wallet = Wallet.open({ id: 'w-5', playerId: 'p-1', initialBalance: Money.from({ amount: '10.00', currency: 'BRL' }) });
    const debitAmount = Money.from({ amount: '10.00', currency: 'BRL' });

    wallet.debit(debitAmount);
    
    expect(wallet.balance.isZero()).toBe(true);
    expect(wallet.version).toBe(2);
  });

  it('should add credit amount and increment aggregate version', () => {
    const wallet = Wallet.open({ id: 'w-6', playerId: 'p-1', initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }) });
    const creditAmount = Money.from({ amount: '40.00', currency: 'BRL' });
    
    wallet.credit(creditAmount);
    
    expect(wallet.balance.equals(Money.from({ amount: '140.00', currency: 'BRL' }))).toBe(true);
    expect(wallet.version).toBe(2);
  });

  it('should throw WalletCurrencyMismatchError on credit with mismatched currency', () => {
    const wallet = Wallet.open({ id: 'w-7', playerId: 'p-1', initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }) });
    const creditAmount = Money.from({ amount: '40.00', currency: 'USD' });
    
    expect(() => wallet.credit(creditAmount)).toThrow(WalletCurrencyMismatchError);
  });

  it('should throw WalletCurrencyMismatchError on debit with mismatched currency', () => {
    const wallet = Wallet.open({ id: 'w-8', playerId: 'p-1', initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }) });
    const debitAmount = Money.from({ amount: '40.00', currency: 'USD' });
    
    expect(() => wallet.debit(debitAmount)).toThrow(WalletCurrencyMismatchError);
  });

  it('should rehydrate preserving state and version without revalidation', () => {
    const now = new Date();
    const wallet = Wallet.rehydrate({
      id: 'w-9',
      playerId: 'p-9',
      currency: 'BRL',
      balance: Money.from({ amount: '25.00', currency: 'BRL' }),
      version: 5,
      createdAt: now,
      updatedAt: now,
    });

    expect(wallet.id).toBe('w-9');
    expect(wallet.playerId).toBe('p-9');
    expect(wallet.version).toBe(5);
    expect(wallet.balance.equals(Money.from({ amount: '25.00', currency: 'BRL' }))).toBe(true);
  });

  it('should handle sequential debits correctly when second exceeds remaining funds', () => {
    const wallet = Wallet.open({ id: 'w-10', playerId: 'p-1', initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }) });
    
    wallet.debit(Money.from({ amount: '80.00', currency: 'BRL' }));
    expect(wallet.balance.equals(Money.from({ amount: '20.00', currency: 'BRL' }))).toBe(true);
    expect(wallet.version).toBe(2);

    expect(() => wallet.debit(Money.from({ amount: '80.00', currency: 'BRL' }))).toThrow(InsufficientFundsError);
    expect(wallet.version).toBe(2);
  });
});
