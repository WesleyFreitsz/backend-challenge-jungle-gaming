import { DomainError } from '../../common/domain-error';

export class InvalidTransactionKindError extends DomainError {
  constructor(message: string = 'Invalid transaction kind submitted') {
    super('INVALID_TRANSACTION_KIND', message);
  }
}
