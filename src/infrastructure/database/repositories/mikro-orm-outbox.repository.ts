import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { OutboxRepositoryPort } from '../../../application/ports/outbox-repository.port';
import { OutboxMessage } from '../../../domain/messaging/outbox-message';
import { OutboxMessageEntity } from '../schemas/outbox-message.schema';

@Injectable()
export class MikroOrmOutboxRepository implements OutboxRepositoryPort {
  constructor(private readonly em: EntityManager) {}

  private mapToDomain(entity: OutboxMessageEntity): OutboxMessage {
    return OutboxMessage.rehydrate({
      id: entity.id,
      aggregateId: entity.aggregateId,
      eventType: entity.eventType,
      payload: entity.payload as Record<string, unknown>,
      occurredAt: entity.occurredAt,
      attempts: entity.attempts,
      nextAttemptAt: entity.nextAttemptAt || undefined,
      publishedAt: entity.publishedAt || undefined,
    });
  }

  private mapToEntity(domain: OutboxMessage): OutboxMessageEntity {
    return this.em.create(OutboxMessageEntity, {
      id: domain.id,
      aggregateId: domain.aggregateId,
      eventType: domain.eventType,
      payload: domain.payload,
      occurredAt: domain.occurredAt,
      attempts: domain.attempts,
      nextAttemptAt: domain.nextAttemptAt || null,
      publishedAt: domain.publishedAt || null,
    });
  }

  async create(message: OutboxMessage): Promise<void> {
    const entity = this.mapToEntity(message);
    this.em.persist(entity);
    await this.em.flush();
  }
  async fetchDueBatch(batchSize: number, now: Date): Promise<OutboxMessage[]> {
    const connection = this.em.getConnection();
    const query = `
      SELECT * FROM outbox_messages 
      WHERE published_at IS NULL 
        AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
      ORDER BY occurred_at ASC 
      LIMIT ? 
      FOR UPDATE SKIP LOCKED
    `;
    const results = await connection.execute(query, [now, batchSize]);

    // MikroORM connection.execute returns raw rows, map them to entities then domain
    const entities = results.map((row: any) =>
      this.em.map(OutboxMessageEntity, row),
    );

    return entities.map((e) => this.mapToDomain(e));
  }

  async markPublished(message: OutboxMessage): Promise<void> {
    const entity = await this.em.findOneOrFail(OutboxMessageEntity, {
      id: message.id,
    });
    entity.publishedAt = message.publishedAt || null;
    await this.em.flush();
  }

  async scheduleRetry(message: OutboxMessage): Promise<void> {
    const entity = await this.em.findOneOrFail(OutboxMessageEntity, {
      id: message.id,
    });
    entity.attempts = message.attempts;
    entity.nextAttemptAt = message.nextAttemptAt || null;
    await this.em.flush();
  }
}
