import { OutboxMessage } from '../../domain/messaging/outbox-message';

/**
 * Port for OutboxMessage persistence — transactional outbox pattern.
 */
export interface OutboxRepositoryPort {
  /** Persist a new outbox message. */
  create(message: OutboxMessage): Promise<void>;

  /**
   * Fetch a batch of unpublished, due messages using SELECT FOR UPDATE SKIP LOCKED.
   * Safe for concurrent publishers.
   */
  fetchDueBatch(batchSize: number, now: Date): Promise<OutboxMessage[]>;

  /** Mark a message as published. */
  markPublished(message: OutboxMessage): Promise<void>;

  /** Schedule a retry with incremented attempts and backoff. */
  scheduleRetry(message: OutboxMessage): Promise<void>;
}

export const OUTBOX_REPOSITORY = Symbol('OutboxRepositoryPort');
