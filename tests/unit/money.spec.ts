import { describe, it, expect } from 'bun:test';
import { Money } from '../../src/domain/money';
import { InvalidMoneyError } from '../../src/domain/money/errors/invalid-money.error';
import { CurrencyMismatchError } from '../../src/domain/money/errors/currency-mismatch.error';

describe('Money Value Object', () => {
  describe('Creation', () => {
    it('should create a valid Money instance', () => {
      const money = Money.from({ amount: '100.00', currency: 'BRL' });
      expect(money.toJSON()).toEqual({ amount: '100.00', currency: 'BRL' });
      expect(money.toString()).toBe('BRL 100.00');
    });

    it('should create zero amount correctly', () => {
      const money = Money.zero('USD');
      expect(money.toJSON()).toEqual({ amount: '0.00', currency: 'USD' });
      expect(money.isZero()).toBe(true);
    });

    it('should allow valid boundary amounts', () => {
      const money = Money.from({ amount: '999999.99', currency: 'EUR' });
      expect(money.toJSON().amount).toBe('999999.99');
    });
  });

  describe('Rejection', () => {
    const invalidAmounts = [
      'NaN', 'Infinity', '-1.00', '25', '25.1', '25.123', '', 'abc', '1e5', null, undefined
    ];

    invalidAmounts.forEach(amount => {
      it(`should reject invalid amount: ${amount}`, () => {
        expect(() => Money.from({ amount: amount as any, currency: 'BRL' }))
          .toThrow(InvalidMoneyError);
      });
    });

    it('should reject invalid currency', () => {
      expect(() => Money.from({ amount: '10.00', currency: '' })).toThrow(InvalidMoneyError);
      expect(() => Money.from({ amount: '10.00', currency: 'brl' })).toThrow(InvalidMoneyError); // Must be uppercase
    });
  });

  describe('Arithmetic', () => {
    it('should add two amounts correctly', () => {
      const m1 = Money.from({ amount: '10.50', currency: 'BRL' });
      const m2 = Money.from({ amount: '20.25', currency: 'BRL' });
      const result = m1.add(m2);
      expect(result.toJSON().amount).toBe('30.75');
    });

    it('should subtract two amounts correctly', () => {
      const m1 = Money.from({ amount: '20.25', currency: 'BRL' });
      const m2 = Money.from({ amount: '10.50', currency: 'BRL' });
      const result = m1.subtract(m2);
      expect(result.toJSON().amount).toBe('9.75');
    });

    it('should negate an amount correctly', () => {
      const m = Money.from({ amount: '10.00', currency: 'BRL' });
      const result = m.negate();
      expect(result.toJSON().amount).toBe('-10.00');
      expect(result.isNegative()).toBe(true);
      expect(result.isPositive()).toBe(false);
    });
  });

  describe('Currency mismatch', () => {
    it('should throw when adding different currencies', () => {
      const m1 = Money.from({ amount: '10.00', currency: 'BRL' });
      const m2 = Money.from({ amount: '10.00', currency: 'USD' });
      expect(() => m1.add(m2)).toThrow(CurrencyMismatchError);
    });

    it('should throw when subtracting different currencies', () => {
      const m1 = Money.from({ amount: '10.00', currency: 'BRL' });
      const m2 = Money.from({ amount: '10.00', currency: 'USD' });
      expect(() => m1.subtract(m2)).toThrow(CurrencyMismatchError);
    });
  });

  describe('Immutability', () => {
    it('should not modify original instances on add', () => {
      const m1 = Money.from({ amount: '10.00', currency: 'BRL' });
      const m2 = Money.from({ amount: '5.00', currency: 'BRL' });
      m1.add(m2);
      expect(m1.toJSON().amount).toBe('10.00');
      expect(m2.toJSON().amount).toBe('5.00');
    });
  });

  describe('Equality', () => {
    it('should correctly compare equality', () => {
      const m1 = Money.from({ amount: '10.00', currency: 'BRL' });
      const m2 = Money.from({ amount: '10.00', currency: 'BRL' });
      const m3 = Money.from({ amount: '10.01', currency: 'BRL' });
      expect(m1.equals(m2)).toBe(true);
      expect(m1.equals(m3)).toBe(false);
    });

    it('should correctly compare isLessThan', () => {
      const m1 = Money.from({ amount: '10.00', currency: 'BRL' });
      const m2 = Money.from({ amount: '15.00', currency: 'BRL' });
      expect(m1.isLessThan(m2)).toBe(true);
      expect(m2.isLessThan(m1)).toBe(false);
    });
  });
});
