import { Injectable } from "@nestjs/common";
import { EntityManager, LockMode } from "@mikro-orm/postgresql";
import { WalletRepositoryPort } from "../../../application/ports/wallet-repository.port";
import { Wallet, WalletState } from "../../../domain/wallet/wallet";
import { WalletEntity } from "../schemas/wallet.schema";
import { Money } from "../../../domain/money/money";

@Injectable()
export class MikroOrmWalletRepository implements WalletRepositoryPort {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string): Promise<Wallet | null> {
    const entity = await this.em.findOne(WalletEntity, { id });
    if (!entity) return null;
    return this.mapToDomain(entity);
  }

  async findByIdForUpdate(id: string): Promise<Wallet | null> {
    const entity = await this.em.findOne(
      WalletEntity,
      { id },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
    if (!entity) return null;
    return this.mapToDomain(entity);
  }

  async findByPlayerAndCurrency(
    playerId: string,
    currency: string,
  ): Promise<Wallet | null> {
    const entity = await this.em.findOne(WalletEntity, { playerId, currency });
    if (!entity) return null;
    return this.mapToDomain(entity);
  }

  async create(wallet: Wallet): Promise<void> {
    const entity = this.mapToEntity(wallet);
    this.em.persist(entity);
    await this.em.flush();
  }

  async update(wallet: Wallet): Promise<void> {
    const entity = await this.em.findOne(WalletEntity, { id: wallet.id });
    if (entity) {
      const money = wallet.balance.toJSON();
      entity.balanceAmount = money.amount;
      entity.balanceCurrency = money.currency;
      entity.version = wallet.version;
      entity.updatedAt = wallet.updatedAt;
      this.em.persist(entity);
    } else {
      const newEntity = this.mapToEntity(wallet);
      this.em.merge(newEntity);
    }
    await this.em.flush();
  }

  private mapToDomain(entity: WalletEntity): Wallet {
    const state: WalletState = {
      id: entity.id,
      playerId: entity.playerId,
      currency: entity.currency,
      balance: Money.from({
        amount: entity.balanceAmount,
        currency: entity.balanceCurrency,
      }),
      version: entity.version,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
    return Wallet.rehydrate(state);
  }

  private mapToEntity(wallet: Wallet): WalletEntity {
    const entity = new WalletEntity();
    entity.id = wallet.id;
    entity.playerId = wallet.playerId;
    entity.currency = wallet.currency;

    const balance = wallet.balance.toJSON();
    entity.balanceAmount = balance.amount;
    entity.balanceCurrency = balance.currency;

    entity.version = wallet.version;
    entity.createdAt = wallet.createdAt;
    entity.updatedAt = wallet.updatedAt;

    return entity;
  }
}
