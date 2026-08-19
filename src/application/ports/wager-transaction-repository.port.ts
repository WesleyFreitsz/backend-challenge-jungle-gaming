import { WagerTransaction } from '../../domain/wagering/wager-transaction';
import { WagerTransactionStatus } from '../../domain/wagering/wager-transaction-status.enum';

/**
 * Port for WagerTransaction persistence operations.
 */
export interface WagerTransactionRepositoryPort {
  /** Find by internal ID. */
  findById(id: string): Promise<WagerTransaction | null>;

  /** Find by idempotency key. */
  findByIdempotencyKey(idempotencyKey: string): Promise<WagerTransaction | null>;

  /** Find by provider ID + external transaction ID. */
  findByProviderAndExternalId(providerId: string, externalTransactionId: string): Promise<WagerTransaction | null>;

  /** Find all transactions in a given status (e.g. PENDING_REFERENCE). */
  findByStatus(status: WagerTransactionStatus, limit: number): Promise<WagerTransaction[]>;

  /**
   * Find all PROCESSED reversals (REFUND/ROLLBACK) that reference a given transaction.
   * Used to check if a reference has already been reversed.
   */
  findProcessedReversalsByReferenceId(referenceTransactionId: string): Promise<WagerTransaction[]>;

  /** Persist a new wager transaction. */
  create(transaction: WagerTransaction): Promise<void>;

  /** Update an existing wager transaction (status, failureCode, processedAt, referenceTransactionId). */
  update(transaction: WagerTransaction): Promise<void>;
}

export const WAGER_TRANSACTION_REPOSITORY = Symbol('WagerTransactionRepositoryPort');
