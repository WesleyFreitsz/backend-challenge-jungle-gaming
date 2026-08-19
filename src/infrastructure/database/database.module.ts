import { Module, Global } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import config from './mikro-orm.config';

import {
  WALLET_REPOSITORY,
  WAGER_TRANSACTION_REPOSITORY,
  LEDGER_REPOSITORY,
  INBOX_REPOSITORY,
  OUTBOX_REPOSITORY,
  UNIT_OF_WORK,
} from '../../application/ports';

import { MikroOrmWalletRepository } from './repositories/mikro-orm-wallet.repository';
import { MikroOrmWagerTransactionRepository } from './repositories/mikro-orm-wager-transaction.repository';
import { MikroOrmLedgerRepository } from './repositories/mikro-orm-ledger.repository';
import { MikroOrmInboxRepository } from './repositories/mikro-orm-inbox.repository';
import { MikroOrmOutboxRepository } from './repositories/mikro-orm-outbox.repository';
import { MikroOrmUnitOfWork } from './unit-of-work/mikro-orm-unit-of-work';

import { WalletSchema } from './schemas/wallet.schema';
import { WalletLedgerEntrySchema } from './schemas/wallet-ledger-entry.schema';
import { WagerTransactionSchema } from './schemas/wager-transaction.schema';
import { InboxMessageSchema } from './schemas/inbox-message.schema';
import { OutboxMessageSchema } from './schemas/outbox-message.schema';

const providers = [
  {
    provide: WALLET_REPOSITORY,
    useClass: MikroOrmWalletRepository,
  },
  {
    provide: WAGER_TRANSACTION_REPOSITORY,
    useClass: MikroOrmWagerTransactionRepository,
  },
  {
    provide: LEDGER_REPOSITORY,
    useClass: MikroOrmLedgerRepository,
  },
  {
    provide: INBOX_REPOSITORY,
    useClass: MikroOrmInboxRepository,
  },
  {
    provide: OUTBOX_REPOSITORY,
    useClass: MikroOrmOutboxRepository,
  },
  {
    provide: UNIT_OF_WORK,
    useClass: MikroOrmUnitOfWork,
  },
];

@Global()
@Module({
  imports: [
    MikroOrmModule.forRoot(config),
    MikroOrmModule.forFeature([
      WalletSchema,
      WalletLedgerEntrySchema,
      WagerTransactionSchema,
      InboxMessageSchema,
      OutboxMessageSchema,
    ]),
  ],
  providers: [...providers],
  exports: [...providers],
})
export class DatabaseModule {}
