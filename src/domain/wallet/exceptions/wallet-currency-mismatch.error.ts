import { DomainError } from '../../common/domain-error';

export class WalletCurrencyMismatchError extends DomainError {
  constructor(message: string = 'Wallet currency mismatch') {
    super('WALLET_CURRENCY_MISMATCH', message);
  }
}
