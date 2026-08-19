import { IntegrationEvent, IntegrationEventProps } from '../messaging/integration-event.base';
import { MoneyProps } from '../money/money.props';
import { LedgerDirection } from '../wallet/ledger-direction.enum';

// ============================================================================
// WagerTransactionProcessed — emitted when any transaction is applied (incl. LOSS)
// ============================================================================

export interface WagerTransactionProcessedData {
  transactionId: string;
  providerId: string;
  externalTransactionId: string;
  playerId: string;
  walletId: string;
  roundId: string;
  gameId: string;
  kind: string;
  money: MoneyProps;
  status: string;
}

export class WagerTransactionProcessed extends IntegrationEvent<WagerTransactionProcessedData> {
  readonly eventType = 'WagerTransactionProcessed';
  readonly version = 1;

  private constructor(props: IntegrationEventProps<WagerTransactionProcessedData>) {
    super(props);
  }

  static from(props: IntegrationEventProps<WagerTransactionProcessedData>): WagerTransactionProcessed {
    return new WagerTransactionProcessed(props);
  }
}

// ============================================================================
// WagerTransactionRejected — emitted when a transaction is rejected by business rule
// ============================================================================

export interface WagerTransactionRejectedData {
  transactionId: string;
  providerId: string;
  externalTransactionId: string;
  playerId: string;
  walletId: string;
  roundId: string;
  kind: string;
  money: MoneyProps;
  failureCode: string;
  status: string;
}

export class WagerTransactionRejected extends IntegrationEvent<WagerTransactionRejectedData> {
  readonly eventType = 'WagerTransactionRejected';
  readonly version = 1;

  private constructor(props: IntegrationEventProps<WagerTransactionRejectedData>) {
    super(props);
  }

  static from(props: IntegrationEventProps<WagerTransactionRejectedData>): WagerTransactionRejected {
    return new WagerTransactionRejected(props);
  }
}

// ============================================================================
// WalletBalanceChanged — emitted only when the balance actually changes
// ============================================================================

export interface WalletBalanceChangedData {
  walletId: string;
  transactionId: string;
  direction: LedgerDirection;
  money: MoneyProps;
  balanceBefore: MoneyProps;
  balanceAfter: MoneyProps;
  walletVersion: number;
}

export class WalletBalanceChanged extends IntegrationEvent<WalletBalanceChangedData> {
  readonly eventType = 'WalletBalanceChanged';
  readonly version = 1;

  private constructor(props: IntegrationEventProps<WalletBalanceChangedData>) {
    super(props);
  }

  static from(props: IntegrationEventProps<WalletBalanceChangedData>): WalletBalanceChanged {
    return new WalletBalanceChanged(props);
  }
}

// ============================================================================
// WagerTransactionPendingReference — emitted when reference is absent
// ============================================================================

export interface WagerTransactionPendingReferenceData {
  transactionId: string;
  providerId: string;
  externalTransactionId: string;
  playerId: string;
  walletId: string;
  roundId: string;
  kind: string;
  referenceExternalTransactionId: string;
}

export class WagerTransactionPendingReference extends IntegrationEvent<WagerTransactionPendingReferenceData> {
  readonly eventType = 'WagerTransactionPendingReference';
  readonly version = 1;

  private constructor(props: IntegrationEventProps<WagerTransactionPendingReferenceData>) {
    super(props);
  }

  static from(props: IntegrationEventProps<WagerTransactionPendingReferenceData>): WagerTransactionPendingReference {
    return new WagerTransactionPendingReference(props);
  }
}
