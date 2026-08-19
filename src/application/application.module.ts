import { Module } from "@nestjs/common";
import { DatabaseModule } from "../infrastructure/database/database.module";
import { CreateWalletUseCase } from "./use-cases/create-wallet.use-case";
import { GetWalletUseCase } from "./use-cases/get-wallet.use-case";
import { ProcessWagerTransactionUseCase } from "./use-cases/process-wager-transaction.use-case";
import { GetWalletLedgerUseCase } from "./use-cases/get-wallet-ledger.use-case";
import { ReconcileWalletUseCase } from "./use-cases/reconcile-wallet.use-case";
import { GetWagerTransactionUseCase } from "./use-cases/get-wager-transaction.use-case";
import { CanonicalJsonHasher } from "../infrastructure/hashing/canonical-json-hasher";

const useCases = [
  CreateWalletUseCase,
  GetWalletUseCase,
  ProcessWagerTransactionUseCase,
  GetWalletLedgerUseCase,
  ReconcileWalletUseCase,
  GetWagerTransactionUseCase,
];

@Module({
  imports: [DatabaseModule],
  providers: [CanonicalJsonHasher, ...useCases],
  exports: [CanonicalJsonHasher, ...useCases],
})
export class ApplicationModule {}
