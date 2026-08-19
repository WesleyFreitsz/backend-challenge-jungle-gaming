import { Decimal } from 'decimal.js';
import { MoneyProps } from './money.props';
import { InvalidMoneyError } from './errors/invalid-money.error';
import { CurrencyMismatchError } from './errors/currency-mismatch.error';

export class Money {
  private readonly value: Decimal;
  private readonly _currency: string;

  private constructor(value: Decimal, currency: string) {
    this.value = value;
    this._currency = currency;
  }

  get currency(): string {
    return this._currency;
  }

  public static from(props: MoneyProps): Money {
    if (!props.amount || typeof props.amount !== 'string') {
      throw new InvalidMoneyError('Amount must be a non-empty string');
    }

    if (!props.currency || typeof props.currency !== 'string' || props.currency !== props.currency.toUpperCase()) {
      throw new InvalidMoneyError('Currency must be a non-empty uppercase string');
    }

    const decimalRegex = /^-?\d+\.\d{2}$/;
    if (!decimalRegex.test(props.amount)) {
      throw new InvalidMoneyError('Amount must have exactly 2 decimal places and be a valid number string');
    }

    let decimalValue: Decimal;
    try {
      decimalValue = new Decimal(props.amount);
    } catch (e) {
      throw new InvalidMoneyError('Invalid decimal amount');
    }

    if (!decimalValue.isFinite() || decimalValue.isNaN()) {
      throw new InvalidMoneyError('Amount must be finite and not NaN');
    }

    if (decimalValue.isNegative()) {
      throw new InvalidMoneyError('Amount cannot be negative in the factory');
    }

    return new Money(decimalValue, props.currency);
  }

  public static zero(currency: string): Money {
    return Money.from({ amount: '0.00', currency });
  }

  public add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.value.plus(other.value), this._currency);
  }

  public subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.value.minus(other.value), this._currency);
  }

  public negate(): Money {
    return new Money(this.value.negated(), this._currency);
  }

  public isZero(): boolean {
    return this.value.isZero();
  }

  public isPositive(): boolean {
    return this.value.isPositive() && !this.value.isZero();
  }

  public isNegative(): boolean {
    return this.value.isNegative();
  }

  public isLessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.value.lessThan(other.value);
  }

  public equals(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.value.equals(other.value);
  }

  public toJSON(): MoneyProps {
    return {
      amount: this.value.toFixed(2),
      currency: this._currency
    };
  }

  public toString(): string {
    return `${this._currency} ${this.value.toFixed(2)}`;
  }

  private assertSameCurrency(other: Money): void {
    if (this._currency !== other._currency) {
      throw new CurrencyMismatchError();
    }
  }
}
