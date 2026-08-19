import { Migration } from '@mikro-orm/migrations';

export class Migration20260819000001_initial extends Migration {
  async up(): Promise<void> {
    // 1. wallets
    this.execute(`
      CREATE TABLE wallets (
        id VARCHAR(255) PRIMARY KEY,
        player_id VARCHAR(255) NOT NULL,
        currency VARCHAR(3) NOT NULL,
        balance_amount NUMERIC(20, 2) NOT NULL DEFAULT 0,
        balance_currency VARCHAR(3) NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        
        CONSTRAINT chk_wallets_balance_non_negative CHECK (balance_amount >= 0),
        CONSTRAINT uq_wallets_player_currency UNIQUE (player_id, currency)
      );
    `);

    // 2. wager_transactions
    this.execute(`
      CREATE TABLE wager_transactions (
        id VARCHAR(255) PRIMARY KEY,
        provider_id VARCHAR(255) NOT NULL,
        external_transaction_id VARCHAR(255) NOT NULL,
        idempotency_key VARCHAR(512) NOT NULL,
        payload_hash VARCHAR(64) NOT NULL,
        wallet_id VARCHAR(255) NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
        player_id VARCHAR(255) NOT NULL,
        round_id VARCHAR(255) NOT NULL,
        game_id VARCHAR(255) NOT NULL,
        kind VARCHAR(20) NOT NULL,
        amount NUMERIC(20, 2) NOT NULL,
        amount_currency VARCHAR(3) NOT NULL,
        reference_external_transaction_id VARCHAR(255),
        status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
        reference_transaction_id VARCHAR(255),
        failure_code VARCHAR(60),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processed_at TIMESTAMPTZ,
        
        CONSTRAINT uq_wager_idempotency_key UNIQUE (idempotency_key),
        CONSTRAINT uq_wager_provider_external UNIQUE (provider_id, external_transaction_id)
      );
    `);

    this.execute(`
      CREATE UNIQUE INDEX uq_reversal_per_reference
        ON wager_transactions (reference_transaction_id, kind)
        WHERE status = 'PROCESSED' AND kind IN ('REFUND', 'ROLLBACK');
    `);

    this.execute(`
      CREATE INDEX idx_wager_tx_provider_external
        ON wager_transactions (provider_id, external_transaction_id);
    `);

    this.execute(`
      CREATE INDEX idx_wager_tx_pending_reference
        ON wager_transactions (status, created_at)
        WHERE status = 'PENDING_REFERENCE';
    `);

    this.execute(`
      CREATE INDEX idx_wager_tx_wallet_id
        ON wager_transactions (wallet_id);
    `);

    // 3. wallet_ledger_entries
    this.execute(`
      CREATE TABLE wallet_ledger_entries (
        id VARCHAR(255) PRIMARY KEY,
        wallet_id VARCHAR(255) NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
        transaction_id VARCHAR(255) NOT NULL REFERENCES wager_transactions(id) ON DELETE RESTRICT,
        direction VARCHAR(10) NOT NULL,
        amount NUMERIC(20, 2) NOT NULL,
        amount_currency VARCHAR(3) NOT NULL,
        balance_before_amount NUMERIC(20, 2) NOT NULL,
        balance_before_currency VARCHAR(3) NOT NULL,
        balance_after_amount NUMERIC(20, 2) NOT NULL,
        balance_after_currency VARCHAR(3) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        
        CONSTRAINT uq_ledger_transaction_wallet UNIQUE (transaction_id, wallet_id),
        CONSTRAINT chk_ledger_amount_positive CHECK (amount >= 0)
      );
    `);

    this.execute(`
      CREATE INDEX idx_ledger_wallet_created
        ON wallet_ledger_entries (wallet_id, created_at DESC, id DESC);
    `);

    this.execute(`
      CREATE OR REPLACE FUNCTION prevent_ledger_mutation() RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'wallet_ledger_entries is immutable: UPDATE and DELETE are forbidden';
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);

    this.execute(`
      CREATE TRIGGER trg_ledger_immutable_update
        BEFORE UPDATE ON wallet_ledger_entries
        FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();
    `);

    this.execute(`
      CREATE TRIGGER trg_ledger_immutable_delete
        BEFORE DELETE ON wallet_ledger_entries
        FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();
    `);

    // 4. inbox_messages
    this.execute(`
      CREATE TABLE inbox_messages (
        message_id VARCHAR(255) NOT NULL,
        consumer_name VARCHAR(255) NOT NULL,
        payload_hash VARCHAR(64) NOT NULL,
        received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processed_at TIMESTAMPTZ,
        
        CONSTRAINT pk_inbox_messages PRIMARY KEY (consumer_name, message_id)
      );
    `);

    // 5. outbox_messages
    this.execute(`
      CREATE TABLE outbox_messages (
        id VARCHAR(255) PRIMARY KEY,
        aggregate_id VARCHAR(255) NOT NULL,
        event_type VARCHAR(100) NOT NULL,
        payload JSONB NOT NULL,
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TIMESTAMPTZ,
        published_at TIMESTAMPTZ
      );
    `);

    this.execute(`
      CREATE INDEX idx_outbox_pending
        ON outbox_messages (published_at, next_attempt_at)
        WHERE published_at IS NULL;
    `);
  }

  async down(): Promise<void> {
    this.execute(`DROP INDEX IF EXISTS idx_outbox_pending;`);
    this.execute(`DROP TABLE IF EXISTS outbox_messages;`);
    
    this.execute(`DROP TABLE IF EXISTS inbox_messages;`);

    this.execute(`DROP TRIGGER IF EXISTS trg_ledger_immutable_delete ON wallet_ledger_entries;`);
    this.execute(`DROP TRIGGER IF EXISTS trg_ledger_immutable_update ON wallet_ledger_entries;`);
    this.execute(`DROP FUNCTION IF EXISTS prevent_ledger_mutation;`);

    this.execute(`DROP INDEX IF EXISTS idx_ledger_wallet_created;`);
    this.execute(`DROP TABLE IF EXISTS wallet_ledger_entries;`);

    this.execute(`DROP INDEX IF EXISTS idx_wager_tx_wallet_id;`);
    this.execute(`DROP INDEX IF EXISTS idx_wager_tx_pending_reference;`);
    this.execute(`DROP INDEX IF EXISTS idx_wager_tx_provider_external;`);
    this.execute(`DROP INDEX IF EXISTS uq_reversal_per_reference;`);
    this.execute(`DROP TABLE IF EXISTS wager_transactions;`);

    this.execute(`DROP TABLE IF EXISTS wallets;`);
  }
}
