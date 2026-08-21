import "dotenv/config";
import { defineConfig } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import { WalletSchema } from "./schemas/wallet.schema";
import { WalletLedgerEntrySchema } from "./schemas/wallet-ledger-entry.schema";
import { WagerTransactionSchema } from "./schemas/wager-transaction.schema";
import { InboxMessageSchema } from "./schemas/inbox-message.schema";
import { OutboxMessageSchema } from "./schemas/outbox-message.schema";

export default defineConfig({
  entities: [
    WalletSchema,
    WalletLedgerEntrySchema,
    WagerTransactionSchema,
    InboxMessageSchema,
    OutboxMessageSchema,
  ],
  dbName: process.env.DATABASE_NAME || "wagering",
  host: process.env.DATABASE_HOST || "localhost",
  port: Number(process.env.DATABASE_PORT) || 5433,
  user: process.env.DATABASE_USER || "wagering_user",
  password: process.env.DATABASE_PASSWORD || "wagering_secret_pass",
  allowGlobalContext: true,
  extensions: [Migrator],
  migrations: {
    path: "./src/infrastructure/database/migrations",
    pathTs: "./src/infrastructure/database/migrations",
    glob: "!(*.d).{js,ts}",
    transactional: true,
  },
  debug: process.env.NODE_ENV === "development",
});
