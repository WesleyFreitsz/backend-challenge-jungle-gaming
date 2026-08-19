import { EntitySchema } from '@mikro-orm/core';

export class WagerTransactionEntity {
  id!: string;
  providerId!: string;
  externalTransactionId!: string;
  idempotencyKey!: string;
  payloadHash!: string;
  walletId!: string;
  playerId!: string;
  roundId!: string;
  gameId!: string;
  kind!: string;
  amount!: string;
  amountCurrency!: string;
  referenceExternalTransactionId!: string | null;
  status!: string;
  referenceTransactionId!: string | null;
  failureCode!: string | null;
  createdAt!: Date;
  processedAt!: Date | null;
}

export const WagerTransactionSchema = new EntitySchema<WagerTransactionEntity>({
  class: WagerTransactionEntity,
  tableName: 'wager_transactions',
  properties: {
    id: { type: 'string', primary: true },
    providerId: { type: 'string', fieldName: 'provider_id' },
    externalTransactionId: { type: 'string', fieldName: 'external_transaction_id' },
    idempotencyKey: { type: 'string', fieldName: 'idempotency_key' },
    payloadHash: { type: 'string', fieldName: 'payload_hash', length: 64 },
    walletId: { type: 'string', fieldName: 'wallet_id' },
    playerId: { type: 'string', fieldName: 'player_id' },
    roundId: { type: 'string', fieldName: 'round_id' },
    gameId: { type: 'string', fieldName: 'game_id' },
    kind: { type: 'string' },
    amount: { type: 'string', columnType: 'numeric(20,2)' },
    amountCurrency: { type: 'string', fieldName: 'amount_currency', length: 3 },
    referenceExternalTransactionId: { type: 'string', fieldName: 'reference_external_transaction_id', nullable: true },
    status: { type: 'string', default: 'PENDING' },
    referenceTransactionId: { type: 'string', fieldName: 'reference_transaction_id', nullable: true },
    failureCode: { type: 'string', fieldName: 'failure_code', nullable: true },
    createdAt: { type: 'Date', fieldName: 'created_at', columnType: 'timestamptz' },
    processedAt: { type: 'Date', fieldName: 'processed_at', columnType: 'timestamptz', nullable: true },
  },
});
