/**
 * Port for Unit of Work — wraps a database transaction.
 * Ensures that wallet balance change, ledger entry, transaction update,
 * inbox record, and outbox event are all committed atomically.
 */
export interface UnitOfWorkPort {
  /**
   * Execute a function within a single database transaction.
   * If the function throws, the transaction is rolled back.
   * If it succeeds, the transaction is committed.
   */
  execute<T>(work: () => Promise<T>): Promise<T>;
}

export const UNIT_OF_WORK = Symbol('UnitOfWorkPort');
