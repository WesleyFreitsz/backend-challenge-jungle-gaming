import { Injectable } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import {
  LedgerRepositoryPort,
  LedgerPage,
} from "../../../application/ports/ledger-repository.port";
import {
  WalletLedgerEntry,
  LedgerEntryState,
} from "../../../domain/wallet/wallet-ledger-entry";
import { WalletLedgerEntryEntity } from "../schemas/wallet-ledger-entry.schema";
import { Money } from "../../../domain/money/money";
import { LedgerDirection } from "../../../domain/wallet/ledger-direction.enum";

@Injectable()
export class MikroOrmLedgerRepository implements LedgerRepositoryPort {
  constructor(private readonly em: EntityManager) {}

  async create(entry: WalletLedgerEntry): Promise<void> {
    const entity = this.mapToEntity(entry);
    this.em.persist(entity);
    await this.em.flush();
  }

  async findByWalletId(
    walletId: string,
    cursor: string | null,
    limit: number,
  ): Promise<LedgerPage> {
    const qb = this.em.createQueryBuilder(WalletLedgerEntryEntity);
    qb.where({ walletId }).orderBy({ createdAt: "desc", id: "desc" });

    const offset = cursor ? parseInt(cursor, 10) : 0;
    qb.limit(limit).offset(offset);

    const results = await qb.getResultList();
    const nextCursor =
      results.length === limit ? (offset + limit).toString() : null;

    return {
      entries: results.map((e) => this.mapToDomain(e)),
      nextCursor,
    };
  }

  async calculateBalanceByWalletId(
    walletId: string,
  ): Promise<{ balance: Money; entryCount: number }> {
    const connection = this.em.getConnection();
    const result = await connection.execute(
      `
      SELECT 
        SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END) as balance, 
        COUNT(*) as count 
      FROM wallet_ledger_entries 
      WHERE wallet_id = ?
    `,
      [walletId],
    );

    const row = result[0];
    const balanceAmount = row.balance || "0.00";
    const entryCount = parseInt(row.count, 10) || 0;

    const currencyResult = await connection.execute(
      `
      SELECT amount_currency as currency
      FROM wallet_ledger_entries
      WHERE wallet_id = ?
      LIMIT 1
    `,
      [walletId],
    );

    const currency = currencyResult[0]?.currency || "BRL";

    return {
      balance: Money.from({
        amount: Number(balanceAmount).toFixed(2),
        currency,
      }),
      entryCount,
    };
  }

  private mapToDomain(entity: WalletLedgerEntryEntity): WalletLedgerEntry {
    const state: LedgerEntryState = {
      id: entity.id,
      walletId: entity.walletId,
      transactionId: entity.transactionId,
      direction: entity.direction as LedgerDirection,
      money: Money.from({
        amount: entity.amount,
        currency: entity.amountCurrency,
      }),
      balanceBefore: Money.from({
        amount: entity.balanceBeforeAmount,
        currency: entity.balanceBeforeCurrency,
      }),
      balanceAfter: Money.from({
        amount: entity.balanceAfterAmount,
        currency: entity.balanceAfterCurrency,
      }),
      createdAt: entity.createdAt,
    };
    return WalletLedgerEntry.rehydrate(state);
  }

  private mapToEntity(entry: WalletLedgerEntry): WalletLedgerEntryEntity {
    const entity = new WalletLedgerEntryEntity();
    entity.id = entry.id;
    entity.walletId = entry.walletId;
    entity.transactionId = entry.transactionId;
    entity.direction = entry.direction;

    const money = entry.money.toJSON();
    entity.amount = money.amount;
    entity.amountCurrency = money.currency;

    const balanceBefore = entry.balanceBefore.toJSON();
    entity.balanceBeforeAmount = balanceBefore.amount;
    entity.balanceBeforeCurrency = balanceBefore.currency;

    const balanceAfter = entry.balanceAfter.toJSON();
    entity.balanceAfterAmount = balanceAfter.amount;
    entity.balanceAfterCurrency = balanceAfter.currency;

    entity.createdAt = entry.createdAt;

    return entity;
  }
}
