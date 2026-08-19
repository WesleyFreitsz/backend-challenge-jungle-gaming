import { InboxMessage } from '../../domain/messaging/inbox-message';

/**
 * Port for InboxMessage persistence — SQS deduplication.
 */
export interface InboxRepositoryPort {
  /** Find by composite key (consumerName + messageId). */
  findByKey(consumerName: string, messageId: string): Promise<InboxMessage | null>;

  /** Persist a new inbox record. */
  create(message: InboxMessage): Promise<void>;

  /** Update processed_at timestamp. */
  update(message: InboxMessage): Promise<void>;
}

export const INBOX_REPOSITORY = Symbol('InboxRepositoryPort');
