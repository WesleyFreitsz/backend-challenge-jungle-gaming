import { EntitySchema } from '@mikro-orm/core';

export class InboxMessageEntity {
  messageId!: string;
  consumerName!: string;
  payloadHash!: string;
  receivedAt!: Date;
  processedAt!: Date | null;
}

export const InboxMessageSchema = new EntitySchema<InboxMessageEntity>({
  class: InboxMessageEntity,
  tableName: 'inbox_messages',
  properties: {
    messageId: { type: 'string', fieldName: 'message_id', primary: true },
    consumerName: { type: 'string', fieldName: 'consumer_name', primary: true },
    payloadHash: { type: 'string', fieldName: 'payload_hash', length: 64 },
    receivedAt: { type: 'Date', fieldName: 'received_at', columnType: 'timestamptz' },
    processedAt: { type: 'Date', fieldName: 'processed_at', columnType: 'timestamptz', nullable: true },
  },
});
