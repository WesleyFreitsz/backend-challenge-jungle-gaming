import { WalletLedgerEntry } from '../../domain/wallet/wallet-ledger-entry';
import { Money } from '../../domain/money/money';

export interface LedgerPage {
  entries: WalletLedgerEntry[];
  nextCursor: string | null;
}

/**
 * Port for WalletLedgerEntry persistence operations.
 */
export interface LedgerRepositoryPort {
  /** Persist a new ledger entry. */
  create(entry: WalletLedgerEntry): Promise<void>;

  /** Find all entries for a wallet with cursor-based pagination. */
  findByWalletId(walletId: string, cursor: string | null, limit: number): Promise<LedgerPage>;

  /**
   * Sum all ledger entries for a wallet to reconstruct the balance.
   * Used for reconciliation: credits - debits = calculated balance.
   */
  calculateBalanceByWalletId(walletId: string): Promise<{ balance: Money; entryCount: number }>;
}

export const LEDGER_REPOSITORY = Symbol('LedgerRepositoryPort');
