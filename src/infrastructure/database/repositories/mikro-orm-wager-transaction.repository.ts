import { Injectable } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { WagerTransactionRepositoryPort } from "../../../application/ports/wager-transaction-repository.port";
import { WagerTransaction } from "../../../domain/wagering/wager-transaction";
import { WagerTransactionStatus } from "../../../domain/wagering/wager-transaction-status.enum";
import { WagerTransactionEntity } from "../schemas/wager-transaction.schema";
import { Money } from "../../../domain/money/money";
import { WagerTransactionKind } from "../../../domain/wagering/wager-transaction-kind.enum";
import { FailureCode } from "../../../domain/wagering/failure-code.enum";

@Injectable()
export class MikroOrmWagerTransactionRepository implements WagerTransactionRepositoryPort {
  constructor(private readonly em: EntityManager) {}

  private mapToDomain(entity: WagerTransactionEntity): WagerTransaction {
    return WagerTransaction.rehydrate({
      id: entity.id,
      providerId: entity.providerId,
      externalTransactionId: entity.externalTransactionId,
      idempotencyKey: entity.idempotencyKey,
      payloadHash: entity.payloadHash,
      walletId: entity.walletId,
      playerId: entity.playerId,
      roundId: entity.roundId,
      gameId: entity.gameId,
      kind: entity.kind as WagerTransactionKind,
      money: Money.from({
        amount: entity.amount,
        currency: entity.amountCurrency,
      }),
      referenceExternalTransactionId:
        entity.referenceExternalTransactionId || undefined,
      createdAt: entity.createdAt,
      status: entity.status as WagerTransactionStatus,
      referenceTransactionId: entity.referenceTransactionId || undefined,
      failureCode: (entity.failureCode as FailureCode) || undefined,
      processedAt: entity.processedAt || undefined,
    });
  }

  private mapToEntity(domain: WagerTransaction): WagerTransactionEntity {
    return this.em.create(WagerTransactionEntity, {
      id: domain.id,
      providerId: domain.providerId,
      externalTransactionId: domain.externalTransactionId,
      idempotencyKey: domain.idempotencyKey,
      payloadHash: domain.payloadHash,
      walletId: domain.walletId,
      playerId: domain.playerId,
      roundId: domain.roundId,
      gameId: domain.gameId,
      kind: domain.kind,
      amount: domain.money.toJSON().amount,
      amountCurrency: domain.money.currency,
      referenceExternalTransactionId:
        domain.referenceExternalTransactionId || null,
      status: domain.status,
      referenceTransactionId: domain.referenceTransactionId || null,
      failureCode: domain.failureCode || null,
      createdAt: domain.createdAt,
      processedAt: domain.processedAt || null,
    });
  }

  async findById(id: string): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(WagerTransactionEntity, { id });
    return entity ? this.mapToDomain(entity) : null;
  }

  async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(WagerTransactionEntity, {
      idempotencyKey,
    });
    return entity ? this.mapToDomain(entity) : null;
  }

  async findByProviderAndExternalId(
    providerId: string,
    externalTransactionId: string,
  ): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(WagerTransactionEntity, {
      providerId,
      externalTransactionId,
    });
    return entity ? this.mapToDomain(entity) : null;
  }

  async findByStatus(
    status: WagerTransactionStatus,
    limit: number,
  ): Promise<WagerTransaction[]> {
    const entities = await this.em.find(
      WagerTransactionEntity,
      { status },
      { limit },
    );
    return entities.map((e) => this.mapToDomain(e));
  }

  async findProcessedReversalsByReferenceId(
    referenceTransactionId: string,
  ): Promise<WagerTransaction[]> {
    const entities = await this.em.find(WagerTransactionEntity, {
      referenceTransactionId,
      status: WagerTransactionStatus.Processed,
      kind: {
        $in: [WagerTransactionKind.Refund, WagerTransactionKind.Rollback],
      },
    });
    return entities.map((e) => this.mapToDomain(e));
  }

  async create(transaction: WagerTransaction): Promise<void> {
    const entity = this.mapToEntity(transaction);
    this.em.persist(entity);
    await this.em.flush();
  }

  async update(transaction: WagerTransaction): Promise<void> {
    const entity = await this.em.findOneOrFail(WagerTransactionEntity, {
      id: transaction.id,
    });

    entity.status = transaction.status;
    entity.referenceTransactionId = transaction.referenceTransactionId || null;
    entity.failureCode = transaction.failureCode || null;
    entity.processedAt = transaction.processedAt || null;

    await this.em.flush();
  }
}
