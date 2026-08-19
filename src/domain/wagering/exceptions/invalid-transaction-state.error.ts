import { DomainError } from '../../common/domain-error';

export class InvalidTransactionStateError extends DomainError {
  constructor(message: string = 'Invalid transaction state transition') {
    super('INVALID_TRANSACTION_STATE', message);
  }
}
