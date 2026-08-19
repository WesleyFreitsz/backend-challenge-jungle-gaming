import { EntitySchema } from '@mikro-orm/core';

export class WalletEntity {
  id!: string;
  playerId!: string;
  currency!: string;
  balanceAmount!: string;
  balanceCurrency!: string;
  version!: number;
  createdAt!: Date;
  updatedAt!: Date;
}

export const WalletSchema = new EntitySchema<WalletEntity>({
  class: WalletEntity,
  tableName: 'wallets',
  properties: {
    id: { type: 'string', primary: true },
    playerId: { type: 'string', fieldName: 'player_id' },
    currency: { type: 'string', length: 3 },
    balanceAmount: { type: 'string', fieldName: 'balance_amount', columnType: 'numeric(20,2)' },
    balanceCurrency: { type: 'string', fieldName: 'balance_currency', length: 3 },
    version: { type: 'number', default: 1 },
    createdAt: { type: 'Date', fieldName: 'created_at', columnType: 'timestamptz' },
    updatedAt: { type: 'Date', fieldName: 'updated_at', columnType: 'timestamptz' },
  },
});
