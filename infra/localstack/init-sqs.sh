#!/bin/bash
# ===========================================
# LocalStack SQS Init Script
# Creates FIFO queues for the wagering system
# ===========================================

echo "Creating SQS FIFO queues..."

# Dead Letter Queue (must be created first for redrive policy)
awslocal sqs create-queue \
  --queue-name wager-transactions-dlq.fifo \
  --attributes '{
    "FifoQueue": "true",
    "ContentBasedDeduplication": "false",
    "MessageRetentionPeriod": "1209600"
  }'

# Main ingress queue with redrive policy to DLQ
awslocal sqs create-queue \
  --queue-name wager-transactions.fifo \
  --attributes '{
    "FifoQueue": "true",
    "ContentBasedDeduplication": "false",
    "VisibilityTimeout": "30",
    "RedrivePolicy": "{\"deadLetterTargetArn\":\"arn:aws:sqs:us-east-1:000000000000:wager-transactions-dlq.fifo\",\"maxReceiveCount\":\"5\"}"
  }'

# Egress events queue (outbox publisher target)
awslocal sqs create-queue \
  --queue-name wager-transaction-events.fifo \
  --attributes '{
    "FifoQueue": "true",
    "ContentBasedDeduplication": "false",
    "MessageRetentionPeriod": "1209600"
  }'

echo "SQS queues created successfully:"
awslocal sqs list-queues
