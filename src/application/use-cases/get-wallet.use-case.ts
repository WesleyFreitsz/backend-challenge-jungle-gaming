import { Injectable, Inject } from '@nestjs/common';
import { WALLET_REPOSITORY } from '../ports/wallet-repository.port';
import type { WalletRepositoryPort } from '../ports/wallet-repository.port';

export interface GetWalletQuery {
  walletId: string;
}

export interface GetWalletResult {
  id: string;
  playerId: string;
  currency: string;
  balance: { amount: string; currency: string };
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class GetWalletUseCase {
  constructor(
    @Inject(WALLET_REPOSITORY)
    private readonly walletRepository: WalletRepositoryPort,
  ) {}

  async execute(query: GetWalletQuery): Promise<GetWalletResult | null> {
    const wallet = await this.walletRepository.findById(query.walletId);
    if (!wallet) {
      return null;
    }

    return {
      id: wallet.id,
      playerId: wallet.playerId,
      currency: wallet.currency,
      balance: wallet.balance.toJSON(),
      version: wallet.version,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
    };
  }
}
