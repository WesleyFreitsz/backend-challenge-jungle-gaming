import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  Inject,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { WAGER_TRANSACTION_REPOSITORY } from '../../application/ports/wager-transaction-repository.port';
import type { WagerTransactionRepositoryPort } from '../../application/ports/wager-transaction-repository.port';
import { OUTBOX_REPOSITORY } from '../../application/ports/outbox-repository.port';
import type { OutboxRepositoryPort } from '../../application/ports/outbox-repository.port';
import { ProcessWagerTransactionUseCase } from '../../application/use-cases/process-wager-transaction.use-case';
import { WagerTransactionStatus } from '../../domain/wagering/wager-transaction-status.enum';
import { FailureCode } from '../../domain/wagering/failure-code.enum';
import { WagerTransactionRejected } from '../../domain/events/integration-events';
import { OutboxMessage } from '../../domain/messaging/outbox-message';

@Injectable()
export class PendingReferenceWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PendingReferenceWorker.name);
  private isShuttingDown = false;
  private intervalId?: ReturnType<typeof setInterval>;
  private readonly ttlMs = Number(process.env.PENDING_REFERENCE_TTL_MS) || 60000; // 60s default TTL

  constructor(
    @Inject(WAGER_TRANSACTION_REPOSITORY)
    private readonly wagerRepository: WagerTransactionRepositoryPort,
    @Inject(OUTBOX_REPOSITORY)
    private readonly outboxRepository: OutboxRepositoryPort,
    private readonly processWagerUseCase: ProcessWagerTransactionUseCase,
  ) {}

  onApplicationBootstrap() {
    this.logger.log(`Starting Pending Reference Worker (TTL: ${this.ttlMs}ms)...`);
    this.startPolling();
  }

  onApplicationShutdown() {
    this.logger.log('Shutting down Pending Reference Worker...');
    this.isShuttingDown = true;
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  private startPolling() {
    // Poll every 5 seconds
    this.intervalId = setInterval(() => {
      this.processPendingReferences();
    }, 5000);
  }

  private async processPendingReferences() {
    if (this.isShuttingDown) return;

    try {
      // Fetch up to 50 pending reference transactions
      const pendingTx = await this.wagerRepository.findByStatus(
        WagerTransactionStatus.PendingReference,
        50,
      );

      if (pendingTx.length === 0) {
        return;
      }

      this.logger.log(`Evaluating ${pendingTx.length} pending reference transactions...`);
      const now = Date.now();

      for (const tx of pendingTx) {
        try {
          const ageMs = now - tx.createdAt.getTime();

          // Check if TTL has expired
          if (ageMs > this.ttlMs) {
            this.logger.warn(
              `Transaction ${tx.id} exceeded TTL (${ageMs}ms > ${this.ttlMs}ms). Rejecting with REFERENCE_NOT_FOUND.`,
            );

            tx.reject(FailureCode.ReferenceNotFound);
            await this.wagerRepository.update(tx);

            const rejectionEvent = WagerTransactionRejected.from({
              eventId: uuidv4(),
              aggregateId: tx.id,
              correlationId: tx.id,
              occurredAt: new Date(),
              data: {
                transactionId: tx.id,
                providerId: tx.providerId,
                externalTransactionId: tx.externalTransactionId,
                playerId: tx.playerId,
                walletId: tx.walletId,
                roundId: tx.roundId,
                kind: tx.kind,
                money: tx.money.toJSON(),
                failureCode: FailureCode.ReferenceNotFound,
                status: tx.status,
              },
            });

            await this.outboxRepository.create(OutboxMessage.enqueue(rejectionEvent));
            continue;
          }

          // Re-execute the use case with the exact same data to attempt processing again
          await this.processWagerUseCase.execute({
            providerId: tx.providerId,
            externalTransactionId: tx.externalTransactionId,
            idempotencyKey: tx.idempotencyKey,
            playerId: tx.playerId,
            walletId: tx.walletId,
            roundId: tx.roundId,
            gameId: tx.gameId,
            kind: tx.kind,
            money: { amount: tx.money.toJSON().amount, currency: tx.money.toJSON().currency },
            referenceExternalTransactionId: tx.referenceExternalTransactionId,
            occurredAt: tx.createdAt,
          });
        } catch (error: any) {
          this.logger.error(`Failed to reprocess pending reference ${tx.id}: ${error.message}`);
        }
      }
    } catch (error: any) {
      this.logger.error(`Error in pending reference loop: ${error.message}`, error.stack);
    }
  }
}
