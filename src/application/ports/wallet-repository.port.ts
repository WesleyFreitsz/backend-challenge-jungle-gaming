import { Wallet } from '../../domain/wallet/wallet';

/**
 * Port for Wallet persistence operations.
 * Implemented by the infrastructure layer with MikroORM.
 */
export interface WalletRepositoryPort {
  /** Find wallet by ID. Returns null if not found. */
  findById(id: string): Promise<Wallet | null>;

  /**
   * Find wallet by ID with pessimistic lock (SELECT FOR UPDATE).
   * Must be called within an active transaction.
   */
  findByIdForUpdate(id: string): Promise<Wallet | null>;

  /** Find wallet by player + currency. Returns null if not found. */
  findByPlayerAndCurrency(playerId: string, currency: string): Promise<Wallet | null>;

  /** Persist a new wallet. */
  create(wallet: Wallet): Promise<void>;

  /** Update an existing wallet (balance, version, updatedAt). */
  update(wallet: Wallet): Promise<void>;
}

export const WALLET_REPOSITORY = Symbol('WalletRepositoryPort');
