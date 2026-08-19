import { Injectable, Inject } from '@nestjs/common';
import { LEDGER_REPOSITORY } from '../ports/ledger-repository.port';
import type { LedgerRepositoryPort } from '../ports/ledger-repository.port';

export interface GetWalletLedgerQuery {
  walletId: string;
  cursor?: string;
  limit?: number;
}

export interface GetWalletLedgerResult {
  entries: {
    id: string;
    transactionId: string;
    direction: string;
    amount: string;
    currency: string;
    balanceBefore: string;
    balanceAfter: string;
    createdAt: Date;
  }[];
  nextCursor: string | null;
}

@Injectable()
export class GetWalletLedgerUseCase {
  constructor(
    @Inject(LEDGER_REPOSITORY)
    private readonly ledgerRepository: LedgerRepositoryPort,
  ) {}

  async execute(query: GetWalletLedgerQuery): Promise<GetWalletLedgerResult> {
    const limit = query.limit && query.limit > 0 ? query.limit : 50;
    const page = await this.ledgerRepository.findByWalletId(query.walletId, query.cursor || null, limit);

    return {
      entries: page.entries.map((entry) => ({
        id: entry.id,
        transactionId: entry.transactionId,
        direction: entry.direction,
        amount: entry.money.toJSON().amount,
        currency: entry.money.toJSON().currency,
        balanceBefore: entry.balanceBefore.toJSON().amount,
        balanceAfter: entry.balanceAfter.toJSON().amount,
        createdAt: entry.createdAt,
      })),
      nextCursor: page.nextCursor,
    };
  }
}
