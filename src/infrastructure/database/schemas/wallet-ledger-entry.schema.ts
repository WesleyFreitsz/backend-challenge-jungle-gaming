import { EntitySchema } from '@mikro-orm/core';

export class WalletLedgerEntryEntity {
  id!: string;
  walletId!: string;
  transactionId!: string;
  direction!: string;
  amount!: string;
  amountCurrency!: string;
  balanceBeforeAmount!: string;
  balanceBeforeCurrency!: string;
  balanceAfterAmount!: string;
  balanceAfterCurrency!: string;
  createdAt!: Date;
}

export const WalletLedgerEntrySchema = new EntitySchema<WalletLedgerEntryEntity>({
  class: WalletLedgerEntryEntity,
  tableName: 'wallet_ledger_entries',
  properties: {
    id: { type: 'string', primary: true },
    walletId: { type: 'string', fieldName: 'wallet_id' },
    transactionId: { type: 'string', fieldName: 'transaction_id' },
    direction: { type: 'string' },
    amount: { type: 'string', columnType: 'numeric(20,2)' },
    amountCurrency: { type: 'string', fieldName: 'amount_currency', length: 3 },
    balanceBeforeAmount: { type: 'string', fieldName: 'balance_before_amount', columnType: 'numeric(20,2)' },
    balanceBeforeCurrency: { type: 'string', fieldName: 'balance_before_currency', length: 3 },
    balanceAfterAmount: { type: 'string', fieldName: 'balance_after_amount', columnType: 'numeric(20,2)' },
    balanceAfterCurrency: { type: 'string', fieldName: 'balance_after_currency', length: 3 },
    createdAt: { type: 'Date', fieldName: 'created_at', columnType: 'timestamptz' },
  },
});
