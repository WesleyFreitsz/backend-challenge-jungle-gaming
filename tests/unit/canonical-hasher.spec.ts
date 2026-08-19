import { describe, it, expect } from 'bun:test';
import { CanonicalJsonHasher } from '../../src/infrastructure/hashing/canonical-json-hasher';

describe('CanonicalJsonHasher', () => {
  const hasher = new CanonicalJsonHasher();

  describe('hash', () => {
    it('should produce deterministic hash for same payload', () => {
      const payload = { name: 'test', value: '100.00' };
      const hash1 = hasher.hash(payload);
      const hash2 = hasher.hash(payload);

      expect(hash1).toBe(hash2);
      expect(hash1).toBeString();
      expect(hash1.length).toBe(64); // SHA-256 hex = 64 chars
    });

    it('should produce same hash regardless of key order', () => {
      const payload1 = { b: '2', a: '1', c: '3' };
      const payload2 = { a: '1', c: '3', b: '2' };

      expect(hasher.hash(payload1)).toBe(hasher.hash(payload2));
    });

    it('should sort nested objects recursively', () => {
      const payload1 = {
        money: { currency: 'BRL', amount: '25.00' },
        kind: 'BET',
      };
      const payload2 = {
        kind: 'BET',
        money: { amount: '25.00', currency: 'BRL' },
      };

      expect(hasher.hash(payload1)).toBe(hasher.hash(payload2));
    });

    it('should produce different hashes for different payloads', () => {
      const payload1 = { amount: '25.00', currency: 'BRL' };
      const payload2 = { amount: '50.00', currency: 'BRL' };

      expect(hasher.hash(payload1)).not.toBe(hasher.hash(payload2));
    });

    it('should handle arrays without reordering elements', () => {
      const payload1 = { items: ['a', 'b', 'c'] };
      const payload2 = { items: ['a', 'b', 'c'] };
      const payload3 = { items: ['c', 'b', 'a'] };

      expect(hasher.hash(payload1)).toBe(hasher.hash(payload2));
      expect(hasher.hash(payload1)).not.toBe(hasher.hash(payload3));
    });

    it('should handle null and undefined values consistently', () => {
      const payload1 = { a: '1', b: null };
      const payload2 = { a: '1', b: null };

      expect(hasher.hash(payload1)).toBe(hasher.hash(payload2));
    });

    it('should exclude undefined values from hash', () => {
      const payload1 = { a: '1', b: undefined };
      const payload2 = { a: '1' };

      expect(hasher.hash(payload1)).toBe(hasher.hash(payload2));
    });

    it('should handle deeply nested objects', () => {
      const payload1 = {
        level1: {
          level2: {
            z: '3',
            a: '1',
            m: { y: '2', x: '1' },
          },
        },
      };
      const payload2 = {
        level1: {
          level2: {
            a: '1',
            m: { x: '1', y: '2' },
            z: '3',
          },
        },
      };

      expect(hasher.hash(payload1)).toBe(hasher.hash(payload2));
    });
  });

  describe('hashWagerPayload', () => {
    it('should hash only business fields from a wager transaction payload', () => {
      const payload = {
        providerId: 'provider-a',
        externalTransactionId: 'tx-123',
        playerId: 'player-1',
        walletId: 'wallet-1',
        roundId: 'round-987',
        gameId: 'fortune-chimp',
        kind: 'BET',
        money: { amount: '25.00', currency: 'BRL' },
      };

      const hash = hasher.hashWagerPayload(payload);
      expect(hash).toBeString();
      expect(hash.length).toBe(64);
    });

    it('should produce same hash regardless of extra transport fields', () => {
      const payload1 = {
        providerId: 'provider-a',
        externalTransactionId: 'tx-123',
        playerId: 'player-1',
        walletId: 'wallet-1',
        roundId: 'round-987',
        gameId: 'fortune-chimp',
        kind: 'BET',
        money: { amount: '25.00', currency: 'BRL' },
      };

      const payload2 = {
        ...payload1,
        messageId: 'msg-456',       // transport metadata - ignored
        occurredAt: '2026-07-29',    // transport metadata - ignored
        idempotencyKey: 'some-key',  // transport metadata - ignored
      };

      expect(hasher.hashWagerPayload(payload1)).toBe(hasher.hashWagerPayload(payload2));
    });

    it('should include referenceExternalTransactionId when present', () => {
      const base = {
        providerId: 'provider-a',
        externalTransactionId: 'tx-123',
        playerId: 'player-1',
        walletId: 'wallet-1',
        roundId: 'round-987',
        gameId: 'fortune-chimp',
        kind: 'REFUND',
        money: { amount: '25.00', currency: 'BRL' },
      };

      const withRef = { ...base, referenceExternalTransactionId: 'tx-original' };
      const withoutRef = { ...base };

      expect(hasher.hashWagerPayload(withRef)).not.toBe(hasher.hashWagerPayload(withoutRef));
    });

    it('should produce different hash when any business field changes', () => {
      const base = {
        providerId: 'provider-a',
        externalTransactionId: 'tx-123',
        playerId: 'player-1',
        walletId: 'wallet-1',
        roundId: 'round-987',
        gameId: 'fortune-chimp',
        kind: 'BET',
        money: { amount: '25.00', currency: 'BRL' },
      };

      // Change amount
      expect(hasher.hashWagerPayload(base)).not.toBe(
        hasher.hashWagerPayload({ ...base, money: { amount: '50.00', currency: 'BRL' } }),
      );

      // Change kind
      expect(hasher.hashWagerPayload(base)).not.toBe(
        hasher.hashWagerPayload({ ...base, kind: 'WIN' }),
      );

      // Change provider
      expect(hasher.hashWagerPayload(base)).not.toBe(
        hasher.hashWagerPayload({ ...base, providerId: 'provider-b' }),
      );
    });
  });
});
