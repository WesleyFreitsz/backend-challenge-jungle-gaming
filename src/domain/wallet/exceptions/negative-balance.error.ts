import { DomainError } from '../../common/domain-error';

export class NegativeBalanceError extends DomainError {
  constructor(message: string = 'Operation would result in a negative balance') {
    super('NEGATIVE_BALANCE', message);
  }
}
