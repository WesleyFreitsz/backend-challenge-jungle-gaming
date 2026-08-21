import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Test, TestingModule } from '@nestjs/testing';
import { ApplicationModule } from '../../src/application/application.module';
import { OUTBOX_REPOSITORY } from '../../src/application/ports/outbox-repository.port';
import type { OutboxRepositoryPort } from '../../src/application/ports/outbox-repository.port';
import { OutboxMessage } from '../../src/domain/messaging/outbox-message';
import { OutboxMessageEntity } from '../../src/infrastructure/database/schemas/outbox-message.schema';
import { MikroOrmOutboxRepository } from '../../src/infrastructure/database/repositories/mikro-orm-outbox.repository';
import { MikroORM } from '@mikro-orm/postgresql';
import { v4 as uuidv4 } from 'uuid';

describe('Integration: Outbox Publisher & SKIP LOCKED Concurrency', () => {
  let app: TestingModule;
  let outboxRepo: OutboxRepositoryPort;
  let orm: MikroORM;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [ApplicationModule],
    }).compile();

    outboxRepo = app.get(OUTBOX_REPOSITORY);
    orm = app.get(MikroORM);

    const migrator = orm.migrator;
    if (migrator) {
      await migrator.up();
    }
  });

  afterAll(async () => {
    if (orm) {
      await orm.close(true);
    }
  });

  it('should allow multiple concurrent publisher workers to claim disjoint outbox batches using SKIP LOCKED', async () => {
    const em = orm.em.fork();
    const aggregateId = `agg-outbox-${uuidv4().substring(0, 8)}`;

    // Insert 10 pending outbox messages in PostgreSQL
    const messageIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const eventId = uuidv4();
      messageIds.push(eventId);
      const msg = OutboxMessage.enqueue({
        eventId,
        aggregateId,
        eventType: 'WagerTransactionProcessed',
        occurredAt: new Date(),
        toJSON: () => ({ index: i, aggregateId }),
      });
      await outboxRepo.create(msg);
    }

    // Run 2 parallel transactions keeping connection locks active concurrently
    const em1 = orm.em.fork();
    const em2 = orm.em.fork();

    let batch1Ids: string[] = [];
    let batch2Ids: string[] = [];

    await Promise.all([
      em1.transactional(async (txEm1) => {
        const repo1 = new MikroOrmOutboxRepository(txEm1 as any);
        const batch1 = await repo1.fetchDueBatch(5, new Date());
        batch1Ids = batch1.map((m) => m.id);

        // Keep txEm1 open while txEm2 runs
        await new Promise((resolve) => setTimeout(resolve, 50));

        for (const msg of batch1) {
          msg.markPublished(new Date());
          await repo1.markPublished(msg);
        }
      }),
      em2.transactional(async (txEm2) => {
        // Small delay to ensure txEm1 acquires the first 5 locks
        await new Promise((resolve) => setTimeout(resolve, 10));

        const repo2 = new MikroOrmOutboxRepository(txEm2 as any);
        const batch2 = await repo2.fetchDueBatch(5, new Date());
        batch2Ids = batch2.map((m) => m.id);

        for (const msg of batch2) {
          msg.markPublished(new Date());
          await repo2.markPublished(msg);
        }
      }),
    ]);

    // Verify both batches are non-empty
    expect(batch1Ids.length).toBe(5);
    expect(batch2Ids.length).toBe(5);

    // Verify there is ZERO overlap between batch1 and batch2 (disjoint sets due to SKIP LOCKED)
    const intersection = batch1Ids.filter((id) => batch2Ids.includes(id));
    expect(intersection.length).toBe(0);

    // Verify published status in DB
    const publishedRows = await em.find(OutboxMessageEntity, { id: { $in: batch1Ids } });
    expect(publishedRows.length).toBe(5);
    publishedRows.forEach((row) => {
      expect(row.publishedAt).not.toBeNull();
    });
  });
});
