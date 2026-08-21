import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { MikroOrmInboxRepository } from '../../../../../src/infrastructure/database/repositories/mikro-orm-inbox.repository';
import { InboxMessage } from '../../../../../src/domain/messaging/inbox-message';

describe('MikroOrmInboxRepository', () => {
  let repository: MikroOrmInboxRepository;
  let mockEm: any;

  beforeEach(() => {
    mockEm = {
      create: mock((entity, props) => props),
      findOne: mock(() => null),
      findOneOrFail: mock(() => ({})),
      find: mock(() => []),
      persist: mock(() => {}),
      flush: mock(async () => {}),
    };
    repository = new MikroOrmInboxRepository(mockEm);
  });

  it('should persist a new inbox message', async () => {
    const msg = InboxMessage.receive({
      messageId: 'msg-1',
      consumerName: 'consumer-1',
      payloadHash: 'hash',
      receivedAt: new Date(),
    });

    await repository.create(msg);

    expect(mockEm.create).toHaveBeenCalled();
    expect(mockEm.persist).toHaveBeenCalled();
  });

  it('should update an existing inbox message', async () => {
    const msg = InboxMessage.receive({
      messageId: 'msg-1',
      consumerName: 'consumer-1',
      payloadHash: 'hash',
      receivedAt: new Date(),
    });
    msg.markProcessed(new Date());

    mockEm.findOneOrFail.mockResolvedValueOnce({});
    await repository.update(msg);

    expect(mockEm.findOneOrFail).toHaveBeenCalled();
    expect(mockEm.flush).toHaveBeenCalled();
  });
});
