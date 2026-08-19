import { Injectable } from '@nestjs/common';
import * as client from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly registry: client.Registry;

  public readonly transactionsCounter: client.Counter;
  public readonly idempotencyConflictsCounter: client.Counter;
  public readonly reversalsCounter: client.Counter;
  public readonly processingDurationHistogram: client.Histogram;
  public readonly outboxLagGauge: client.Gauge;
  public readonly dlqMessagesGauge: client.Gauge;

  constructor() {
    this.registry = new client.Registry();
    client.collectDefaultMetrics({ register: this.registry });

    this.transactionsCounter = new client.Counter({
      name: 'wagering_transactions_total',
      help: 'Total number of processed wagering transactions by status and kind',
      labelNames: ['status', 'kind', 'provider'],
      registers: [this.registry],
    });

    this.idempotencyConflictsCounter = new client.Counter({
      name: 'wagering_idempotency_conflicts_total',
      help: 'Total number of detected idempotency payload mismatches',
      registers: [this.registry],
    });

    this.reversalsCounter = new client.Counter({
      name: 'wagering_reversals_total',
      help: 'Total number of refunds and rollbacks processed',
      labelNames: ['kind', 'status'],
      registers: [this.registry],
    });

    this.processingDurationHistogram = new client.Histogram({
      name: 'wagering_processing_duration_seconds',
      help: 'Processing duration for wagering transactions in seconds',
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
      registers: [this.registry],
    });

    this.outboxLagGauge = new client.Gauge({
      name: 'wagering_outbox_lag',
      help: 'Number of pending outbox messages yet to be published',
      registers: [this.registry],
    });

    this.dlqMessagesGauge = new client.Gauge({
      name: 'wagering_dlq_messages_total',
      help: 'Estimated number of messages in the Dead Letter Queue',
      registers: [this.registry],
    });
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
