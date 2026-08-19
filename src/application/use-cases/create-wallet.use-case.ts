import { Injectable, Inject } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Wallet } from '../../domain/wallet/wallet';
import { WalletLedgerEntry } from '../../domain/wallet/wallet-ledger-entry';
import { Money } from '../../domain/money/money';
import { LedgerDirection } from '../../domain/wallet/ledger-direction.enum';
import { WagerTransaction } from '../../domain/wagering/wager-transaction';
import { WagerTransactionKind } from '../../domain/wagering/wager-transaction-kind.enum';
import { OutboxMessage } from '../../domain/messaging/outbox-message';
import { WalletBalanceChanged, WagerTransactionProcessed } from '../../domain/events/integration-events';

import {
  WALLET_REPOSITORY,
  WAGER_TRANSACTION_REPOSITORY,
  LEDGER_REPOSITORY,
  OUTBOX_REPOSITORY,
  UNIT_OF_WORK,
} from '../ports';
import type {
  WalletRepositoryPort,
  WagerTransactionRepositoryPort,
  LedgerRepositoryPort,
  OutboxRepositoryPort,
  UnitOfWorkPort,
} from '../ports';
import { DomainError } from '../../domain/common/domain-error';

export interface CreateWalletCommand {
  playerId: string;
  currency: string;
  initialBalanceAmount: string;
  idempotencyKey?: string; // Optional idempotency key for opening
}

export interface CreateWalletResult {
  id: string;
  playerId: string;
  balance: { amount: string; currency: string };
  version: number;
}

@Injectable()
export class CreateWalletUseCase {
  constructor(
    @Inject(UNIT_OF_WORK)
    private readonly uow: UnitOfWorkPort,
    @Inject(WALLET_REPOSITORY)
    private readonly walletRepository: WalletRepositoryPort,
    @Inject(LEDGER_REPOSITORY)
    private readonly ledgerRepository: LedgerRepositoryPort,
    @Inject(WAGER_TRANSACTION_REPOSITORY)
    private readonly wagerRepository: WagerTransactionRepositoryPort,
    @Inject(OUTBOX_REPOSITORY)
    private readonly outboxRepository: OutboxRepositoryPort,
  ) {}

  async execute(command: CreateWalletCommand): Promise<CreateWalletResult> {
    return this.uow.execute(async () => {
      // 1. Check if wallet already exists for this player and currency
      const existingWallet = await this.walletRepository.findByPlayerAndCurrency(
        command.playerId,
        command.currency,
      );

      if (existingWallet) {
        throw new DomainError(
          'DUPLICATE_WALLET',
          `Player ${command.playerId} already has a ${command.currency} wallet`,
        );
      }

      // 2. Prepare Domain Models
      const walletId = uuidv4();
      const initialBalance = Money.from({
        amount: command.initialBalanceAmount,
        currency: command.currency,
      });

      // Wallet
      const wallet = Wallet.open({
        id: walletId,
        playerId: command.playerId,
        initialBalance,
      });

      // To insert an opening balance, we must represent it as a valid OPENING wager transaction
      // and a corresponding ledger entry so the system's ledger balances perfectly.
      const openingTransactionId = uuidv4();
      const openingTx = WagerTransaction.create({
        id: openingTransactionId,
        providerId: 'SYSTEM',
        externalTransactionId: `OPEN-${walletId}`,
        idempotencyKey: command.idempotencyKey || `OPEN-${walletId}`,
        payloadHash: 'SYSTEM_OPENING_NO_HASH',
        walletId: walletId,
        playerId: command.playerId,
        roundId: 'N/A',
        gameId: 'N/A',
        kind: WagerTransactionKind.Opening,
        money: initialBalance,
        createdAt: wallet.createdAt,
      });
      openingTx.markProcessed(undefined, wallet.createdAt);

      const ledgerEntry = WalletLedgerEntry.create({
        id: uuidv4(),
        walletId: walletId,
        transactionId: openingTransactionId,
        direction: LedgerDirection.Credit,
        money: initialBalance,
        balanceBefore: Money.zero(command.currency),
        balanceAfter: initialBalance,
        createdAt: wallet.createdAt,
      });

      // 3. Persist State
      await this.walletRepository.create(wallet);
      await this.wagerRepository.create(openingTx);
      await this.ledgerRepository.create(ledgerEntry);

      // 4. Enqueue Outbox Events
      const walletEvent = WalletBalanceChanged.from({
        eventId: uuidv4(),
        aggregateId: wallet.id,
        correlationId: openingTransactionId,
        occurredAt: wallet.updatedAt,
        data: {
          walletId: wallet.id,
          transactionId: openingTransactionId,
          direction: LedgerDirection.Credit,
          money: initialBalance.toJSON(),
          balanceBefore: Money.zero(command.currency).toJSON(),
          balanceAfter: initialBalance.toJSON(),
          walletVersion: wallet.version,
        },
      });

      const txEvent = WagerTransactionProcessed.from({
        eventId: uuidv4(),
        aggregateId: openingTx.id,
        correlationId: openingTx.id,
        occurredAt: openingTx.createdAt,
        data: {
          transactionId: openingTx.id,
          providerId: openingTx.providerId,
          externalTransactionId: openingTx.externalTransactionId,
          playerId: openingTx.playerId,
          walletId: openingTx.walletId,
          roundId: openingTx.roundId,
          gameId: openingTx.gameId,
          kind: openingTx.kind,
          money: openingTx.money.toJSON(),
          status: openingTx.status,
        },
      });

      await this.outboxRepository.create(OutboxMessage.enqueue(walletEvent));
      await this.outboxRepository.create(OutboxMessage.enqueue(txEvent));

      return {
        id: wallet.id,
        playerId: wallet.playerId,
        balance: wallet.balance.toJSON(),
        version: wallet.version,
      };
    });
  }
}
