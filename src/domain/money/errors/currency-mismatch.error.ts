import { DomainError } from '../../common/domain-error';

export class CurrencyMismatchError extends DomainError {
  constructor(message: string = 'Currency mismatch between Money instances') {
    super(message, 'CURRENCY_MISMATCH');
  }
}
