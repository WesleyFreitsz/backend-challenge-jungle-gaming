import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { MikroOrmWagerTransactionRepository } from '../../../../../src/infrastructure/database/repositories/mikro-orm-wager-transaction.repository';
import { WagerTransaction } from '../../../../../src/domain/wagering/wager-transaction';
import { WagerTransactionKind } from '../../../../../src/domain/wagering/wager-transaction-kind.enum';
import { Money } from '../../../../../src/domain/money/money';
import { WagerTransactionEntity } from '../../../../../src/infrastructure/database/schemas/wager-transaction.schema';

describe('MikroOrmWagerTransactionRepository', () => {
  let repository: MikroOrmWagerTransactionRepository;
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
    repository = new MikroOrmWagerTransactionRepository(mockEm);
  });

  it('deve persistir um novo wager transaction', async () => {
    const tx = WagerTransaction.create({
      id: 'tx-1',
      providerId: 'provider-1',
      externalTransactionId: 'ext-1',
      idempotencyKey: 'idem-1',
      payloadHash: 'hash',
      walletId: 'w-1',
      playerId: 'p-1',
      roundId: 'r-1',
      gameId: 'g-1',
      kind: WagerTransactionKind.Bet,
      money: Money.from({ amount: '10.00', currency: 'BRL' }),
    });

    await repository.create(tx);

    expect(mockEm.create).toHaveBeenCalled();
    expect(mockEm.persist).toHaveBeenCalled();
  });

  it('deve atualizar um wager transaction existente', async () => {
    const tx = WagerTransaction.create({
      id: 'tx-1',
      providerId: 'provider-1',
      externalTransactionId: 'ext-1',
      idempotencyKey: 'idem-1',
      payloadHash: 'hash',
      walletId: 'w-1',
      playerId: 'p-1',
      roundId: 'r-1',
      gameId: 'g-1',
      kind: WagerTransactionKind.Bet,
      money: Money.from({ amount: '10.00', currency: 'BRL' }),
    });
    tx.markProcessed(undefined, new Date());

    mockEm.findOneOrFail.mockResolvedValueOnce(new WagerTransactionEntity());
    await repository.update(tx);

    expect(mockEm.findOneOrFail).toHaveBeenCalled();
    expect(mockEm.flush).toHaveBeenCalled();
  });
});
