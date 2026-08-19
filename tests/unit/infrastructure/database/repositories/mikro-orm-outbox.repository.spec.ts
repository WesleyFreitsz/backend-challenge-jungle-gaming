import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { MikroOrmOutboxRepository } from '../../../../../src/infrastructure/database/repositories/mikro-orm-outbox.repository';
import { OutboxMessage } from '../../../../../src/domain/messaging/outbox-message';

describe('MikroOrmOutboxRepository', () => {
  let repository: MikroOrmOutboxRepository;
  let mockEm: any;
  let mockConnection: any;

  beforeEach(() => {
    mockConnection = {
      execute: mock(async () => []),
    };
    mockEm = {
      create: mock((entity, props) => props),
      map: mock((entity, row) => row),
      findOneOrFail: mock(() => ({})),
      persist: mock(() => {}),
      flush: mock(async () => {}),
      getConnection: mock(() => mockConnection),
    };
    repository = new MikroOrmOutboxRepository(mockEm);
  });

  it('deve persistir um novo outbox message', async () => {
    const msg = OutboxMessage.enqueue({
      eventId: 'evt-1',
      aggregateId: 'agg-1',
      eventType: 'EventOccurred',
      occurredAt: new Date(),
      toJSON: () => ({ foo: 'bar' }),
    });

    await repository.create(msg);

    expect(mockEm.create).toHaveBeenCalled();
    expect(mockEm.persist).toHaveBeenCalled();
  });

  it('deve buscar mensagens pendentes com lock', async () => {
    const msg = OutboxMessage.enqueue({
      eventId: 'evt-1',
      aggregateId: 'agg-1',
      eventType: 'EventOccurred',
      occurredAt: new Date(),
      toJSON: () => ({ foo: 'bar' }),
    });
    
    // Simulate raw DB row mapping
    const rawRow = {
      id: msg.id,
      aggregateId: msg.aggregateId,
      eventType: msg.eventType,
      payload: msg.payload,
      occurredAt: msg.occurredAt,
      attempts: 0,
      nextAttemptAt: null,
      publishedAt: null,
    };
    
    mockConnection.execute.mockResolvedValueOnce([rawRow]);

    const batch = await repository.fetchDueBatch(10, new Date());

    expect(mockEm.getConnection).toHaveBeenCalled();
    expect(mockConnection.execute).toHaveBeenCalled();
    expect(batch.length).toBe(1);
    expect(batch[0].id).toBe('evt-1');
  });
});
