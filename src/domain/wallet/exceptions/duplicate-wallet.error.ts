import { DomainError } from '../../common/domain-error';

export class DuplicateWalletError extends DomainError {
  constructor(message: string = 'Wallet already exists for this player and currency') {
    super('DUPLICATE_WALLET', message);
  }
}
