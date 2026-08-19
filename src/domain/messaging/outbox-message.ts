/**
 * Outbox Message — transactional outbox pattern entity.
 * Enqueued in the same SQL transaction as the financial operation.
 * Published asynchronously by the OutboxPublisherWorker.
 */
export interface OutboxMessageState {
  id: string;
  aggregateId: string;
  eventType: string;
  payload: Readonly<Record<string, unknown>>;
  occurredAt: Date;
  attempts: number;
  nextAttemptAt?: Date;
  publishedAt?: Date;
}

export class OutboxMessage {
  private constructor(
    public readonly id: string,
    public readonly aggregateId: string,
    public readonly eventType: string,
    public readonly payload: Readonly<Record<string, unknown>>,
    public readonly occurredAt: Date,
    private _attempts: number,
    private _nextAttemptAt?: Date,
    private _publishedAt?: Date,
  ) {}

  static enqueue(event: {
    eventId: string;
    aggregateId: string;
    eventType: string;
    occurredAt: Date;
    toJSON(): Record<string, unknown>;
  }): OutboxMessage {
    return new OutboxMessage(
      event.eventId,
      event.aggregateId,
      event.eventType,
      event.toJSON() as Readonly<Record<string, unknown>>,
      event.occurredAt,
      0,
      undefined,
      undefined,
    );
  }

  static rehydrate(state: OutboxMessageState): OutboxMessage {
    return new OutboxMessage(
      state.id,
      state.aggregateId,
      state.eventType,
      state.payload,
      state.occurredAt,
      state.attempts,
      state.nextAttemptAt,
      state.publishedAt,
    );
  }

  get attempts(): number {
    return this._attempts;
  }

  get nextAttemptAt(): Date | undefined {
    return this._nextAttemptAt;
  }

  get publishedAt(): Date | undefined {
    return this._publishedAt;
  }

  isPending(): boolean {
    return this._publishedAt === undefined;
  }

  isDue(now: Date): boolean {
    if (!this.isPending()) return false;
    if (this._nextAttemptAt === undefined) return true;
    return now >= this._nextAttemptAt;
  }

  markPublished(at: Date): void {
    this._publishedAt = at;
  }

  /**
   * Increments attempts and calculates next attempt time with exponential backoff.
   * Backoff formula: baseDelay * 2^attempts (capped at 5 minutes)
   */
  scheduleRetry(now: Date): void {
    this._attempts += 1;
    const baseDelayMs = 1000;
    const maxDelayMs = 5 * 60 * 1000; // 5 minutes
    const delayMs = Math.min(baseDelayMs * Math.pow(2, this._attempts), maxDelayMs);
    this._nextAttemptAt = new Date(now.getTime() + delayMs);
  }
}
