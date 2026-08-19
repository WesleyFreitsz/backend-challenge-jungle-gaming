import { DomainError } from '../../common/domain-error';

export class InsufficientFundsError extends DomainError {
  constructor(message: string = 'Insufficient funds in wallet') {
    super('INSUFFICIENT_FUNDS', message);
  }
}
