import { createHash } from 'crypto';

export interface WagerPayloadFields {
  providerId: string;
  externalTransactionId: string;
  playerId: string;
  walletId: string;
  roundId: string;
  gameId: string;
  kind: string;
  money: { amount: string; currency: string };
  referenceExternalTransactionId?: string;
}

/**
 * Produces deterministic SHA-256 hashes from objects by sorting keys recursively.
 * Used for idempotency payload verification.
 *
 * Algorithm:
 * 1. Recursively sort all object keys alphabetically
 * 2. Exclude undefined values (null is kept)
 * 3. Arrays preserve element order (not sorted)
 * 4. Serialize to JSON string
 * 5. Hash with SHA-256, output as hex
 */
export class CanonicalJsonHasher {
  hash(payload: Record<string, unknown>): string {
    const canonical = this.canonicalize(payload);
    const json = JSON.stringify(canonical);
    return createHash('sha256').update(json).digest('hex');
  }

  hashWagerPayload(payload: Record<string, unknown>): string {
    const businessFields: Record<string, unknown> = {
      providerId: payload.providerId,
      externalTransactionId: payload.externalTransactionId,
      playerId: payload.playerId,
      walletId: payload.walletId,
      roundId: payload.roundId,
      gameId: payload.gameId,
      kind: payload.kind,
      money: payload.money,
    };

    if (payload.referenceExternalTransactionId !== undefined) {
      businessFields.referenceExternalTransactionId = payload.referenceExternalTransactionId;
    }

    return this.hash(businessFields);
  }

  private canonicalize(value: unknown): unknown {
    if (value === null) {
      return null;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.canonicalize(item));
    }

    if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>;
      const sortedKeys = Object.keys(obj).sort();
      const sorted: Record<string, unknown> = {};

      for (const key of sortedKeys) {
        if (obj[key] !== undefined) {
          sorted[key] = this.canonicalize(obj[key]);
        }
      }

      return sorted;
    }

    return value;
  }
}
