import { Injectable } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { InboxRepositoryPort } from "../../../application/ports/inbox-repository.port";
import { InboxMessage } from "../../../domain/messaging/inbox-message";
import { InboxMessageEntity } from "../schemas/inbox-message.schema";

@Injectable()
export class MikroOrmInboxRepository implements InboxRepositoryPort {
  constructor(private readonly em: EntityManager) {}

  private mapToDomain(entity: InboxMessageEntity): InboxMessage {
    return InboxMessage.rehydrate({
      messageId: entity.messageId,
      consumerName: entity.consumerName,
      payloadHash: entity.payloadHash,
      receivedAt: entity.receivedAt,
      processedAt: entity.processedAt || undefined,
    });
  }

  private mapToEntity(domain: InboxMessage): InboxMessageEntity {
    return this.em.create(InboxMessageEntity, {
      messageId: domain.messageId,
      consumerName: domain.consumerName,
      payloadHash: domain.payloadHash,
      receivedAt: domain.receivedAt,
      processedAt: domain.processedAt || null,
    });
  }

  async findByKey(
    consumerName: string,
    messageId: string,
  ): Promise<InboxMessage | null> {
    const entity = await this.em.findOne(InboxMessageEntity, {
      consumerName,
      messageId,
    });
    return entity ? this.mapToDomain(entity) : null;
  }

  async create(message: InboxMessage): Promise<void> {
    const entity = this.mapToEntity(message);
    this.em.persist(entity);
    await this.em.flush();
  }

  async update(message: InboxMessage): Promise<void> {
    const entity = await this.em.findOneOrFail(InboxMessageEntity, {
      consumerName: message.consumerName,
      messageId: message.messageId,
    });
    entity.processedAt = message.processedAt || null;
    await this.em.flush();
  }
}
