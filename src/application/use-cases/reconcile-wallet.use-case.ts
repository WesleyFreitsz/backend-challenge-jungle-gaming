import { Injectable, Inject, Logger } from '@nestjs/common';
import { WALLET_REPOSITORY } from '../ports/wallet-repository.port';
import type { WalletRepositoryPort } from '../ports/wallet-repository.port';
import { LEDGER_REPOSITORY } from '../ports/ledger-repository.port';
import type { LedgerRepositoryPort } from '../ports/ledger-repository.port';
import { Money } from '../../domain/money/money';

export interface ReconcileWalletQuery {
  walletId: string;
}

export interface ReconcileWalletResult {
  walletId: string;
  storedBalance: { amount: string; currency: string };
  calculatedBalance: { amount: string; currency: string };
  difference: { amount: string; currency: string };
  consistent: boolean;
  checkedEntries: number;
}

@Injectable()
export class ReconcileWalletUseCase {
  private readonly logger = new Logger(ReconcileWalletUseCase.name);

  constructor(
    @Inject(WALLET_REPOSITORY)
    private readonly walletRepository: WalletRepositoryPort,
    @Inject(LEDGER_REPOSITORY)
    private readonly ledgerRepository: LedgerRepositoryPort,
  ) {}

  async execute(query: ReconcileWalletQuery): Promise<ReconcileWalletResult | null> {
    const wallet = await this.walletRepository.findById(query.walletId);
    if (!wallet) {
      return null;
    }

    const calculation = await this.ledgerRepository.calculateBalanceByWalletId(query.walletId);
    
    // Check if the currency amounts match exactly
    const consistent = wallet.balance.equals(calculation.balance);

    // Calculate absolute difference
    let difference: Money;
    try {
      if (wallet.balance.isLessThan(calculation.balance)) {
        difference = calculation.balance.subtract(wallet.balance);
      } else {
        difference = wallet.balance.subtract(calculation.balance);
      }
    } catch {
      difference = Money.zero(wallet.currency);
    }

    if (!consistent) {
      this.logger.warn(
        `Wallet reconciliation inconsistency detected for walletId=${wallet.id}! Stored: ${wallet.balance.toJSON().amount}, Calculated: ${calculation.balance.toJSON().amount}`,
      );
    }

    return {
      walletId: wallet.id,
      storedBalance: wallet.balance.toJSON(),
      calculatedBalance: calculation.balance.toJSON(),
      difference: difference.toJSON(),
      consistent,
      checkedEntries: calculation.entryCount,
    };
  }
}
