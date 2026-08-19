# Distributed Wagering Processor 🦧
*Motor Financeiro Distribuído para iGaming — Jungle Gaming Technical Challenge*

---

## 📌 Sumário
- [1. Visão Geral](#1-visão-geral)
- [2. Arquitetura e Decisões de Design](#2-arquitetura-e-decisões-de-design)
- [3. Stack Tecnológica](#3-stack-tecnológica)
- [4. Instalação e Execução Local](#4-instalação-e-execução-local)
- [5. Execução dos Testes](#5-execução-dos-testes)
  - [5.1 Testes Unitários](#51-testes-unitários)
  - [5.2 Testes de Concorrência](#52-testes-de-concorrência)
  - [5.3 Teste de Carga e Benchmark](#53-teste-de-carga-e-benchmark)
- [6. Contratos de API (HTTP)](#6-contratos-de-api-http)
- [7. Mensageria SQS e Resiliência](#7-mensageria-sqs-e-resiliência)
- [8. Observabilidade e Métricas](#8-observabilidade-e-métricas)

---

## 1. Visão Geral
O **Distributed Wagering Processor** é um microserviço financeiro de alta confiabilidade projetado para processar operações de apostas (`BET`), premiações (`WIN`), perdas (`LOSS`), reembolsos (`REFUND`) e reversões (`ROLLBACK`).

### Invariantes do Sistema:
- **Zero Saldo Negativo e Zero Race Conditions:** Garantidos por lock pessimista de linha (`SELECT ... FOR UPDATE`) no PostgreSQL por `walletId`.
- **Precisão Monetária Absoluta:** Manipulação de valores monetários com biblioteca `decimal.js` encapsulada no Value Object imutável `Money` (2 casas decimais fixas). Proibição total do tipo primitivo `number` para dinheiro.
- **Idempotência Persistente:** Header HTTP `Idempotency-Key` com hash SHA-256 canônico determinístico do payload de negócio.
- **Transactional Outbox & Inbox:** Publicação de eventos pós-commit e deduplicação no consumidor com entrega *at-least-once*.
- **Livro-Razão Contábil (Single-Entry Ledger):** Cada alteração de saldo possui um lançamento correspondente imutável protegido por triggers de banco de dados.

---

## 2. Arquitetura e Decisões de Design
Para detalhes profundos sobre as justificativas de engenharia, consulte o documento [ARCHITECTURE.md](./ARCHITECTURE.md).

```
src/
├── application/         # Use Cases, Ports (Interfaces) e DTOs
├── domain/              # Modelos puros DDD (Money, Wallet, WagerTransaction, Ledger)
├── infrastructure/      # MikroORM, PostgreSQL, SQS, Hasher, Workers e Métricas
└── presentation/        # Controllers HTTP (Wallets, Wagering, Health, Metrics)
```

---

## 3. Stack Tecnológica
- **Runtime:** Bun 1.x
- **Linguagem:** TypeScript (Strict Mode)
- **Framework:** NestJS 11
- **ORM / Persistência:** MikroORM 7 (PostgreSQL 16)
- **Mensageria:** AWS SQS FIFO (LocalStack 3.8)
- **Métricas:** Prometheus (`prom-client`)

---

## 4. Instalação e Execução Local

### Pré-requisitos
- [Bun](https://bun.sh) instalado (`bun --version >= 1.1`)
- [Docker](https://www.docker.com/) e Docker Compose

### 1. Clonar o repositório e instalar dependências:
```bash
git clone <repo-url>
cd distributed-wagering-processor
bun install
```

### 2. Configurar variáveis de ambiente:
```bash
cp .env.example .env
```

### 3. Subir a infraestrutura (PostgreSQL + LocalStack SQS):
```bash
docker compose up -d
```
> O script em `infra/localstack/init-sqs.sh` criará automaticamente as filas FIFO:
> - `wager-transactions.fifo` (Ingresso)
> - `wager-transactions-dlq.fifo` (Dead Letter Queue)
> - `wager-transaction-events.fifo` (Egresso/Outbox)

### 4. Executar as Migrações do Banco de Dados:
```bash
bun run migration:up
```

### 5. Iniciar a Aplicação:
```bash
# Modo desenvolvimento
bun run start:dev

# Modo produção
bun run build
bun run start:prod
```

---

## 5. Execução dos Testes

### 5.1 Testes Unitários
Executa a suíte de testes de domínio, Value Objects, máquinas de estado e reversões:
```bash
bun run test:unit
```

### 5.2 Testes de Concorrência (Real PostgreSQL Concurrency)
Valida a proteção contra *lost updates*, contenção de saldo e concorrência massiva:
```bash
bun run test:concurrency
```

### 5.3 Teste de Carga e Benchmark
Executa um teste de carga com centenas de operações paralelas e validação contábil no final:
```bash
# Certifique-se de que a aplicação está rodando (bun run start)
bun run test:load
```

---

## 6. Contratos de API (HTTP)

### Criar Carteira
```http
POST /wallets
Content-Type: application/json

{
  "playerId": "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
  "initialBalance": { "amount": "1000.00", "currency": "BRL" }
}
```

### Submeter Transação de Aposta / Ganho / Reversão
```http
POST /wagering/transactions
Idempotency-Key: provider-a:tx-99901
Content-Type: application/json

{
  "providerId": "provider-a",
  "externalTransactionId": "tx-99901",
  "playerId": "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
  "walletId": "0192f291-27dd-7d3f-8071-5f8685deef37",
  "roundId": "round-881",
  "gameId": "fortune-chimp",
  "kind": "BET",
  "money": { "amount": "25.00", "currency": "BRL" }
}
```

### Consultar Extrato do Ledger (Paginado via Cursor)
```http
GET /wallets/:walletId/ledger?cursor=0&limit=50
```

### Reconciliação Contábil da Carteira
```http
POST /wallets/:walletId/reconciliation
```
**Resposta:**
```json
{
  "walletId": "0192f291-27dd-7d3f-8071-5f8685deef37",
  "storedBalance": { "amount": "975.00", "currency": "BRL" },
  "calculatedBalance": { "amount": "975.00", "currency": "BRL" },
  "difference": { "amount": "0.00", "currency": "BRL" },
  "consistent": true,
  "checkedEntries": 42
}
```

### Consultar Transações
```http
GET /wagering/transactions/:transactionId
GET /providers/:providerId/wagering/transactions/:externalTransactionId
```

---

## 7. Mensageria SQS e Resiliência
- **SqsConsumerWorker:** Consome mensagens da fila FIFO `wager-transactions.fifo`, registra no inbox transacional `(consumerName, messageId)` e chama o caso de uso principal.
- **OutboxPublisherWorker:** Publica eventos pendentes para `wager-transaction-events.fifo` utilizando `SELECT FOR UPDATE SKIP LOCKED`, suportando múltiplos publicadores concorrentes.
- **PendingReferenceWorker:** Avalia transações em `PENDING_REFERENCE` (operações que chegaram fora de ordem) a cada 5 segundos, com expiração automática por TTL para `REJECTED (REFERENCE_NOT_FOUND)`.

---

## 8. Observabilidade e Métricas
- **Health Checks:**
  - `GET /health/live`: Liveness probe (HTTP 200).
  - `GET /health/ready`: Readiness probe verificando PostgreSQL e SQS (HTTP 200 / 503).
- **Métricas Prometheus:**
  - `GET /metrics`: Exposição de métricas para Prometheus/Grafana (`wagering_transactions_total`, `wagering_idempotency_conflicts_total`, `wagering_reversals_total`, `wagering_processing_duration_seconds`, `wagering_outbox_lag`).
