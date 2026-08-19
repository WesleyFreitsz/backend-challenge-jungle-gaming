import { Injectable, Inject } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Money } from '../../domain/money/money';
import { WagerTransaction } from '../../domain/wagering/wager-transaction';
import { WagerTransactionKind } from '../../domain/wagering/wager-transaction-kind.enum';
import { WagerTransactionStatus } from '../../domain/wagering/wager-transaction-status.enum';
import { FailureCode } from '../../domain/wagering/failure-code.enum';
import { WalletLedgerEntry } from '../../domain/wallet/wallet-ledger-entry';
import { LedgerDirection } from '../../domain/wallet/ledger-direction.enum';
import { OutboxMessage } from '../../domain/messaging/outbox-message';
import {
  WagerTransactionProcessed,
  WagerTransactionRejected,
  WagerTransactionPendingReference,
  WalletBalanceChanged,
} from '../../domain/events/integration-events';
import { CanonicalJsonHasher } from '../../infrastructure/hashing/canonical-json-hasher';
import { DomainError } from '../../domain/common/domain-error';

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

export interface ProcessWagerTransactionCommand {
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  playerId: string;
  walletId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: { amount: string; currency: string };
  referenceExternalTransactionId?: string;
  occurredAt?: Date;
}

export interface ProcessWagerTransactionResult {
  transactionId: string;
  status: WagerTransactionStatus;
  failureCode?: FailureCode;
  balance?: { amount: string; currency: string };
  idempotentReplay: boolean;
}

@Injectable()
export class ProcessWagerTransactionUseCase {
  constructor(
    @Inject(UNIT_OF_WORK)
    private readonly uow: UnitOfWorkPort,
    @Inject(WALLET_REPOSITORY)
    private readonly walletRepository: WalletRepositoryPort,
    @Inject(WAGER_TRANSACTION_REPOSITORY)
    private readonly wagerRepository: WagerTransactionRepositoryPort,
    @Inject(LEDGER_REPOSITORY)
    private readonly ledgerRepository: LedgerRepositoryPort,
    @Inject(OUTBOX_REPOSITORY)
    private readonly outboxRepository: OutboxRepositoryPort,
    private readonly hasher: CanonicalJsonHasher,
  ) {}

  async execute(command: ProcessWagerTransactionCommand): Promise<ProcessWagerTransactionResult> {
    const payloadHash = this.hasher.hashWagerPayload(command as unknown as Record<string, unknown>);

    return this.uow.execute(async () => {
      // 1. Idempotency Check by IdempotencyKey
      const existingTx = await this.wagerRepository.findByIdempotencyKey(command.idempotencyKey);
      if (existingTx) {
        if (!existingTx.matchesPayload(payloadHash)) {
          throw new DomainError('IDEMPOTENCY_CONFLICT', 'Idempotency key reused with different payload');
        }
        if (existingTx.isTerminal()) {
          const wallet = await this.walletRepository.findById(existingTx.walletId);
          return this.buildResult(existingTx, wallet?.balance, true);
        }
      }

      // 2. Duplicate Check by Provider + External ID
      const existingByProvider = await this.wagerRepository.findByProviderAndExternalId(
        command.providerId,
        command.externalTransactionId,
      );
      if (existingByProvider && existingByProvider.idempotencyKey !== command.idempotencyKey) {
        throw new DomainError('DUPLICATE_TRANSACTION', 'Provider and External ID already exist');
      }

      // 3. Prevent OPENING from external calls
      if (command.kind === WagerTransactionKind.Opening) {
        throw new DomainError('INVALID_TRANSACTION_KIND', 'OPENING kind is restricted to internal system usage');
      }

      const money = Money.from(command.money);

      const tx = existingTx || WagerTransaction.create({
        id: uuidv4(),
        providerId: command.providerId,
        externalTransactionId: command.externalTransactionId,
        idempotencyKey: command.idempotencyKey,
        payloadHash,
        walletId: command.walletId,
        playerId: command.playerId,
        roundId: command.roundId,
        gameId: command.gameId,
        kind: command.kind,
        money,
        referenceExternalTransactionId: command.referenceExternalTransactionId,
        createdAt: command.occurredAt || new Date(),
      });

      // 4. Resolve Reference (if required)
      let referenceTx: WagerTransaction | undefined = undefined;
      if (tx.requiresReference()) {
        const ref = await this.wagerRepository.findByProviderAndExternalId(
          command.providerId,
          command.referenceExternalTransactionId!,
        );

        if (!ref) {
          // Put in PENDING_REFERENCE state and wait for retry
          tx.markPendingReference();
          if (existingTx) {
            await this.wagerRepository.update(tx);
          } else {
            await this.wagerRepository.create(tx);
          }
          
          await this.publishEvent(
            WagerTransactionPendingReference.from({
              eventId: uuidv4(),
              aggregateId: tx.id,
              correlationId: tx.id,
              occurredAt: new Date(),
              data: {
                transactionId: tx.id,
                providerId: tx.providerId,
                externalTransactionId: tx.externalTransactionId,
                playerId: tx.playerId,
                walletId: tx.walletId,
                roundId: tx.roundId,
                kind: tx.kind,
                referenceExternalTransactionId: tx.referenceExternalTransactionId!,
              },
            }),
          );
          
          return this.buildResult(tx, undefined, false);
        }

        // Domain validations on reference transaction
        if (ref.status !== WagerTransactionStatus.Processed) {
          tx.reject(FailureCode.ReferenceNotProcessed);
        } else if (ref.playerId !== command.playerId) {
          tx.reject(FailureCode.PlayerMismatch);
        } else if (ref.walletId !== command.walletId) {
          tx.reject(FailureCode.WalletNotFound);
        } else if (ref.roundId !== command.roundId) {
          tx.reject(FailureCode.RoundMismatch);
        } else if (!ref.money.equals(money)) {
          tx.reject(FailureCode.ReversalAmountMismatch);
        } else if (tx.kind === WagerTransactionKind.Refund && ref.kind !== WagerTransactionKind.Bet) {
          tx.reject(FailureCode.RefundOnlyForBet);
        } else if (
          tx.kind === WagerTransactionKind.Rollback &&
          ![WagerTransactionKind.Bet, WagerTransactionKind.Win, WagerTransactionKind.Refund].includes(ref.kind)
        ) {
          tx.reject(FailureCode.InvalidReferenceKind);
        }

        if (tx.isTerminal()) {
          await this.persistRejected(tx, !!existingTx);
          return this.buildResult(tx, undefined, false);
        }

        // Check if reference is already reversed
        const reversals = await this.wagerRepository.findProcessedReversalsByReferenceId(ref.id);
        const alreadyReversed = reversals.some((r) => r.kind === tx.kind);
        if (alreadyReversed) {
          tx.reject(tx.kind === WagerTransactionKind.Refund ? FailureCode.AlreadyRefunded : FailureCode.AlreadyRolledBack);
          await this.persistRejected(tx, !!existingTx);
          return this.buildResult(tx, undefined, false);
        }

        referenceTx = ref;
      } else if (command.referenceExternalTransactionId && command.kind === WagerTransactionKind.Win) {
        // Optional reference for WIN
        const ref = await this.wagerRepository.findByProviderAndExternalId(
          command.providerId,
          command.referenceExternalTransactionId,
        );
        if (ref) referenceTx = ref;
      }

      // 5. Fetch Wallet with PESSIMISTIC LOCK
      const wallet = await this.walletRepository.findByIdForUpdate(command.walletId);
      if (!wallet) {
        tx.reject(FailureCode.WalletNotFound);
        await this.persistRejected(tx, !!existingTx);
        return this.buildResult(tx, undefined, false);
      }

      // Player mismatch?
      if (wallet.playerId !== command.playerId) {
        tx.reject(FailureCode.PlayerMismatch);
        await this.persistRejected(tx, !!existingTx);
        return this.buildResult(tx, undefined, false);
      }

      // Currency mismatch?
      if (wallet.currency !== command.money.currency) {
        tx.reject(FailureCode.CurrencyMismatch);
        await this.persistRejected(tx, !!existingTx);
        return this.buildResult(tx, undefined, false);
      }

      // 6. Apply Financial Operations
      if (tx.affectsBalance()) {
        const balanceBefore = wallet.balance;
        const direction = tx.ledgerDirectionFor(referenceTx);

        try {
          if (direction === LedgerDirection.Debit) {
            wallet.debit(money);
          } else {
            wallet.credit(money);
          }
        } catch (error: any) {
          if (error.name === 'InsufficientFundsError') {
            const isReversal = tx.kind === WagerTransactionKind.Rollback;
            tx.reject(isReversal ? FailureCode.ReversalWouldCauseNegativeBalance : FailureCode.InsufficientFunds);
            await this.persistRejected(tx, !!existingTx);
            return this.buildResult(tx, undefined, false);
          }
          throw error;
        }

        // Apply state
        tx.markProcessed(referenceTx?.id, new Date());
        
        // Ledger Entry
        const ledgerEntry = WalletLedgerEntry.create({
          id: uuidv4(),
          walletId: wallet.id,
          transactionId: tx.id,
          direction,
          money,
          balanceBefore,
          balanceAfter: wallet.balance,
          createdAt: tx.processedAt!,
        });

        if (existingTx) {
          await this.wagerRepository.update(tx);
        } else {
          await this.wagerRepository.create(tx);
        }
        await this.walletRepository.update(wallet);
        await this.ledgerRepository.create(ledgerEntry);

        // Events
        await this.publishEvent(
          WalletBalanceChanged.from({
            eventId: uuidv4(),
            aggregateId: wallet.id,
            correlationId: tx.id,
            occurredAt: wallet.updatedAt,
            data: {
              walletId: wallet.id,
              transactionId: tx.id,
              direction,
              money: money.toJSON(),
              balanceBefore: balanceBefore.toJSON(),
              balanceAfter: wallet.balance.toJSON(),
              walletVersion: wallet.version,
            },
          }),
        );
        await this.persistProcessedEvent(tx);

        return this.buildResult(tx, wallet.balance, false);
      } else {
        // LOSS - no balance effect
        tx.markProcessed(referenceTx?.id, new Date());
        if (existingTx) {
          await this.wagerRepository.update(tx);
        } else {
          await this.wagerRepository.create(tx);
        }
        await this.persistProcessedEvent(tx);
        return this.buildResult(tx, wallet.balance, false);
      }
    });
  }

  private async persistRejected(tx: WagerTransaction, isUpdate: boolean): Promise<void> {
    if (isUpdate) {
      await this.wagerRepository.update(tx);
    } else {
      await this.wagerRepository.create(tx);
    }

    await this.publishEvent(
      WagerTransactionRejected.from({
        eventId: uuidv4(),
        aggregateId: tx.id,
        correlationId: tx.id,
        occurredAt: new Date(),
        data: {
          transactionId: tx.id,
          providerId: tx.providerId,
          externalTransactionId: tx.externalTransactionId,
          playerId: tx.playerId,
          walletId: tx.walletId,
          roundId: tx.roundId,
          kind: tx.kind,
          money: tx.money.toJSON(),
          failureCode: tx.failureCode!,
          status: tx.status,
        },
      }),
    );
  }

  private async persistProcessedEvent(tx: WagerTransaction): Promise<void> {
    await this.publishEvent(
      WagerTransactionProcessed.from({
        eventId: uuidv4(),
        aggregateId: tx.id,
        correlationId: tx.id,
        occurredAt: tx.processedAt!,
        data: {
          transactionId: tx.id,
          providerId: tx.providerId,
          externalTransactionId: tx.externalTransactionId,
          playerId: tx.playerId,
          walletId: tx.walletId,
          roundId: tx.roundId,
          gameId: tx.gameId,
          kind: tx.kind,
          money: tx.money.toJSON(),
          status: tx.status,
        },
      }),
    );
  }

  private async publishEvent(event: any): Promise<void> {
    await this.outboxRepository.create(OutboxMessage.enqueue(event));
  }

  private buildResult(tx: WagerTransaction, balance?: Money, idempotentReplay = false): ProcessWagerTransactionResult {
    return {
      transactionId: tx.id,
      status: tx.status,
      failureCode: tx.failureCode,
      balance: balance ? balance.toJSON() : undefined,
      idempotentReplay,
    };
  }
}
