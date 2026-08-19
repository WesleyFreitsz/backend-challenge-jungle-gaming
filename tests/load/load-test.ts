/**
 * Load & Concurrency Benchmark for Distributed Wagering Processor
 * Run via: bun run test:load
 */

import { v4 as uuidv4 } from 'uuid';

interface BenchmarkResult {
  durationMs: number;
  totalRequests: number;
  successfulRequests: number;
  businessRejections: number;
  unexpectedErrors: number;
  rps: number;
  latencies: number[];
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  avg: number;
}

const BASE_URL = process.env.APP_URL || 'http://localhost:3000';

function calculatePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

async function runLoadTest(
  totalOperations: number = 1000,
  concurrencyLimit: number = 50,
): Promise<BenchmarkResult> {
  console.log('===============================================================');
  console.log('  🦧 Jungle Gaming — Distributed Wagering Load Benchmark');
  console.log('===============================================================');
  console.log(`Target URL:        ${BASE_URL}`);
  console.log(`Total Operations:  ${totalOperations}`);
  console.log(`Concurrency Limit: ${concurrencyLimit}`);
  console.log('---------------------------------------------------------------\n');

  // 1. Setup Wallets for testing
  const NUM_WALLETS = 10;
  const wallets: { id: string; playerId: string }[] = [];

  console.log(`[1/3] Provisioning ${NUM_WALLETS} isolated test wallets...`);
  for (let i = 0; i < NUM_WALLETS; i++) {
    const playerId = `bench-player-${uuidv4().substring(0, 8)}`;
    try {
      const res = await fetch(`${BASE_URL}/wallets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId,
          initialBalance: { amount: '10000.00', currency: 'BRL' },
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as any;
        wallets.push({ id: data.id, playerId: data.playerId });
      } else {
        console.warn(`Failed to create wallet ${i}: HTTP ${res.status}`);
      }
    } catch (err: any) {
      console.error(`Could not reach ${BASE_URL}. Ensure the service is running!`);
      throw err;
    }
  }

  if (wallets.length === 0) {
    throw new Error('No wallets could be created. Is the server online?');
  }

  console.log(`Successfully initialized ${wallets.length} wallets with 10,000.00 BRL each.\n`);
  console.log(`[2/3] Executing ${totalOperations} high-concurrency operations...`);

  const latencies: number[] = [];
  let successfulRequests = 0;
  let businessRejections = 0;
  let unexpectedErrors = 0;

  const startTime = performance.now();

  // Helper worker pool
  let completed = 0;
  let activeIndex = 0;

  async function executeWorker(): Promise<void> {
    while (activeIndex < totalOperations) {
      const currentIndex = activeIndex++;
      const wallet = wallets[currentIndex % wallets.length];
      const opKind = currentIndex % 5 === 0 ? 'WIN' : 'BET';
      const amount = (10 + (currentIndex % 15)).toFixed(2);
      const extTxId = `bench-tx-${currentIndex}-${uuidv4().substring(0, 6)}`;
      const idempotencyKey = `bench-idem-${currentIndex}-${uuidv4().substring(0, 6)}`;

      const reqStart = performance.now();
      try {
        const res = await fetch(`${BASE_URL}/wagering/transactions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify({
            providerId: 'BENCH_PROVIDER',
            externalTransactionId: extTxId,
            playerId: wallet.playerId,
            walletId: wallet.id,
            roundId: `bench-round-${currentIndex}`,
            gameId: 'fortune-chimp',
            kind: opKind,
            money: { amount, currency: 'BRL' },
          }),
        });

        const reqEnd = performance.now();
        latencies.push(reqEnd - reqStart);

        if (res.status === 200 || res.status === 202) {
          const body = (await res.json()) as any;
          if (body.status === 'PROCESSED' || body.status === 'PENDING_REFERENCE') {
            successfulRequests++;
          } else if (body.status === 'REJECTED') {
            businessRejections++;
          }
        } else if (res.status === 400 || res.status === 409) {
          businessRejections++;
        } else {
          unexpectedErrors++;
        }
      } catch {
        unexpectedErrors++;
      } finally {
        completed++;
        if (completed % 100 === 0 || completed === totalOperations) {
          process.stdout.write(`\rProgress: ${completed}/${totalOperations} (${Math.round((completed / totalOperations) * 100)}%)`);
        }
      }
    }
  }

  // Spawn pool
  const workers = Array.from({ length: concurrencyLimit }, () => executeWorker());
  await Promise.all(workers);

  const durationMs = performance.now() - startTime;
  console.log('\n\n[3/3] Checking Ledger Reconciliation Integrity across all test wallets...');

  let consistentWallets = 0;
  for (const w of wallets) {
    try {
      const recRes = await fetch(`${BASE_URL}/wallets/${w.id}/reconciliation`, { method: 'POST' });
      if (recRes.ok) {
        const recData = (await recRes.json()) as any;
        if (recData.consistent) {
          consistentWallets++;
        }
      }
    } catch {}
  }

  latencies.sort((a, b) => a - b);
  const total = latencies.length;
  const sum = latencies.reduce((acc, v) => acc + v, 0);

  const p50 = calculatePercentile(latencies, 50);
  const p90 = calculatePercentile(latencies, 90);
  const p95 = calculatePercentile(latencies, 95);
  const p99 = calculatePercentile(latencies, 99);
  const min = total > 0 ? latencies[0] : 0;
  const max = total > 0 ? latencies[total - 1] : 0;
  const avg = total > 0 ? sum / total : 0;
  const rps = (totalRequests: number) => (totalRequests / (durationMs / 1000));

  const result: BenchmarkResult = {
    durationMs,
    totalRequests: totalOperations,
    successfulRequests,
    businessRejections,
    unexpectedErrors,
    rps: Number(rps(totalOperations).toFixed(2)),
    latencies,
    p50: Number(p50.toFixed(2)),
    p90: Number(p90.toFixed(2)),
    p95: Number(p95.toFixed(2)),
    p99: Number(p99.toFixed(2)),
    min: Number(min.toFixed(2)),
    max: Number(max.toFixed(2)),
    avg: Number(avg.toFixed(2)),
  };

  console.log('\n===============================================================');
  console.log('                   BENCHMARK RESULTS REPORT                   ');
  console.log('===============================================================');
  console.log(`Total Duration:        ${(durationMs / 1000).toFixed(2)}s`);
  console.log(`Throughput:            ${result.rps} requests/sec (RPS)`);
  console.log(`Total Requests:        ${result.totalRequests}`);
  console.log(`  - Successful:        ${result.successfulRequests}`);
  console.log(`  - Handled Rejections:${result.businessRejections}`);
  console.log(`  - Unexpected Errors: ${result.unexpectedErrors}`);
  console.log('---------------------------------------------------------------');
  console.log('Latency Percentiles (ms):');
  console.log(`  - Min:               ${result.min} ms`);
  console.log(`  - Avg:               ${result.avg} ms`);
  console.log(`  - p50:               ${result.p50} ms`);
  console.log(`  - p90:               ${result.p90} ms`);
  console.log(`  - p95:               ${result.p95} ms`);
  console.log(`  - p99:               ${result.p99} ms`);
  console.log(`  - Max:               ${result.max} ms`);
  console.log('---------------------------------------------------------------');
  console.log(`Ledger Invariant:      ${consistentWallets}/${wallets.length} wallets 100% mathematically balanced.`);
  console.log('===============================================================\n');

  return result;
}

if (import.meta.main) {
  const operations = Number(process.env.LOAD_OPS) || 500;
  const concurrency = Number(process.env.LOAD_CONCURRENCY) || 30;
  runLoadTest(operations, concurrency).catch((err) => {
    console.error('Load test aborted with error:', err.message);
    process.exit(1);
  });
}
