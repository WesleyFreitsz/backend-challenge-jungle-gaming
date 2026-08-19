import { Injectable, Inject } from '@nestjs/common';
import { WAGER_TRANSACTION_REPOSITORY } from '../ports/wager-transaction-repository.port';
import type { WagerTransactionRepositoryPort } from '../ports/wager-transaction-repository.port';
import { WagerTransactionStatus } from '../../domain/wagering/wager-transaction-status.enum';
import { FailureCode } from '../../domain/wagering/failure-code.enum';

export interface GetWagerTransactionResult {
  id: string;
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: string;
  amount: string;
  currency: string;
  referenceExternalTransactionId?: string;
  referenceTransactionId?: string;
  status: WagerTransactionStatus;
  failureCode?: FailureCode;
  createdAt: Date;
  processedAt?: Date;
}

@Injectable()
export class GetWagerTransactionUseCase {
  constructor(
    @Inject(WAGER_TRANSACTION_REPOSITORY)
    private readonly wagerRepository: WagerTransactionRepositoryPort,
  ) {}

  async execute(transactionId: string): Promise<GetWagerTransactionResult | null> {
    const tx = await this.wagerRepository.findById(transactionId);
    if (!tx) return null;

    return {
      id: tx.id,
      providerId: tx.providerId,
      externalTransactionId: tx.externalTransactionId,
      idempotencyKey: tx.idempotencyKey,
      walletId: tx.walletId,
      playerId: tx.playerId,
      roundId: tx.roundId,
      gameId: tx.gameId,
      kind: tx.kind,
      amount: tx.money.toJSON().amount,
      currency: tx.money.currency,
      referenceExternalTransactionId: tx.referenceExternalTransactionId,
      referenceTransactionId: tx.referenceTransactionId,
      status: tx.status,
      failureCode: tx.failureCode,
      createdAt: tx.createdAt,
      processedAt: tx.processedAt,
    };
  }

  async executeByProviderAndExternalId(
    providerId: string,
    externalTransactionId: string,
  ): Promise<GetWagerTransactionResult | null> {
    const tx = await this.wagerRepository.findByProviderAndExternalId(providerId, externalTransactionId);
    if (!tx) return null;

    return {
      id: tx.id,
      providerId: tx.providerId,
      externalTransactionId: tx.externalTransactionId,
      idempotencyKey: tx.idempotencyKey,
      walletId: tx.walletId,
      playerId: tx.playerId,
      roundId: tx.roundId,
      gameId: tx.gameId,
      kind: tx.kind,
      amount: tx.money.toJSON().amount,
      currency: tx.money.currency,
      referenceExternalTransactionId: tx.referenceExternalTransactionId,
      referenceTransactionId: tx.referenceTransactionId,
      status: tx.status,
      failureCode: tx.failureCode,
      createdAt: tx.createdAt,
      processedAt: tx.processedAt,
    };
  }
}
