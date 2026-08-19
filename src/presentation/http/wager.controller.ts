import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  Param,
  Res,
  HttpStatus,
  Req,
} from '@nestjs/common';
import type { Request, Response } from "express";
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  ValidateNested,
  IsNumberString,
  NotEquals,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProcessWagerTransactionUseCase } from '../../application/use-cases/process-wager-transaction.use-case';
import { GetWagerTransactionUseCase } from '../../application/use-cases/get-wager-transaction.use-case';
import {
  PublicWagerTransactionKind,
  WagerTransactionKind,
} from '../../domain/wagering/wager-transaction-kind.enum';
import { WagerTransactionStatus } from '../../domain/wagering/wager-transaction-status.enum';

export class MoneyDto {
  @IsNumberString()
  @IsNotEmpty()
  amount!: string;

  @IsString()
  @IsNotEmpty()
  currency!: string;
}

export class ProcessWagerDto {
  @IsString()
  @IsNotEmpty()
  providerId!: string;

  @IsString()
  @IsNotEmpty()
  externalTransactionId!: string;

  @IsString()
  @IsOptional()
  idempotencyKey?: string;

  @IsString()
  @IsNotEmpty()
  playerId!: string;

  @IsString()
  @IsNotEmpty()
  walletId!: string;

  @IsString()
  @IsNotEmpty()
  roundId!: string;

  @IsString()
  @IsNotEmpty()
  gameId!: string;

  @IsEnum(PublicWagerTransactionKind)
  @NotEquals(WagerTransactionKind.Opening, {
    message: 'OPENING is an internal transaction kind and cannot be used via HTTP',
  })
  kind!: PublicWagerTransactionKind;

  @ValidateNested()
  @Type(() => MoneyDto)
  money!: MoneyDto;

  @IsString()
  @IsOptional()
  referenceExternalTransactionId?: string;
}

function toDomainWagerKind(kind: PublicWagerTransactionKind): WagerTransactionKind {
  switch (kind) {
    case PublicWagerTransactionKind.Bet:
      return WagerTransactionKind.Bet;
    case PublicWagerTransactionKind.Win:
      return WagerTransactionKind.Win;
    case PublicWagerTransactionKind.Loss:
      return WagerTransactionKind.Loss;
    case PublicWagerTransactionKind.Refund:
      return WagerTransactionKind.Refund;
    case PublicWagerTransactionKind.Rollback:
      return WagerTransactionKind.Rollback;
  }
}

@Controller('wagering')
export class WagerTransactionController {
  constructor(
    private readonly processWagerUseCase: ProcessWagerTransactionUseCase,
    private readonly getWagerTransactionUseCase: GetWagerTransactionUseCase,
  ) {}

  @Post('transactions')
  async processWager(
    @Req() req: Request,
    @Headers('idempotency-key') idempotencyKeyHeader: string,
    @Body() dto: ProcessWagerDto,
    @Res() res: Response,
  ) {
    try {
      // Header is the source of truth, fallback to body or default convention
      const headerKey =
        idempotencyKeyHeader ||
        (req.headers['Idempotency-Key'] as string) ||
        (req.headers['idempotency-key'] as string);

      const idempotencyKey =
        headerKey ||
        dto.idempotencyKey ||
        `${dto.providerId}:${dto.externalTransactionId}`;

      const result = await this.processWagerUseCase.execute({
        providerId: dto.providerId,
        externalTransactionId: dto.externalTransactionId,
        idempotencyKey,
        playerId: dto.playerId,
        walletId: dto.walletId,
        roundId: dto.roundId,
        gameId: dto.gameId,
        kind: toDomainWagerKind(dto.kind),
        money: dto.money,
        referenceExternalTransactionId: dto.referenceExternalTransactionId,
      });

      if (result.status === WagerTransactionStatus.PendingReference) {
        return res.status(HttpStatus.ACCEPTED).json(result);
      }

      return res.status(HttpStatus.OK).json(result);
    } catch (error: any) {
      if (error.name === 'DomainError') {
        const isConflict =
          error.code === 'IDEMPOTENCY_CONFLICT' ||
          error.code === 'DUPLICATE_TRANSACTION' ||
          error.code === 'DUPLICATE_WALLET';

        return res.status(isConflict ? HttpStatus.CONFLICT : HttpStatus.BAD_REQUEST).json({
          statusCode: isConflict ? 409 : 400,
          error: error.code || 'DOMAIN_ERROR',
          message: error.message,
        });
      }

      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: 500,
        message: 'Internal server error',
      });
    }
  }

  @Get('transactions/:transactionId')
  async getTransactionById(
    @Param('transactionId') transactionId: string,
    @Res() res: Response,
  ) {
    const tx = await this.getWagerTransactionUseCase.execute(transactionId);
    if (!tx) {
      return res.status(HttpStatus.NOT_FOUND).json({
        statusCode: 404,
        message: 'Wager transaction not found',
      });
    }
    return res.status(HttpStatus.OK).json(tx);
  }
}

@Controller('providers')
export class ProviderTransactionsController {
  constructor(private readonly getWagerTransactionUseCase: GetWagerTransactionUseCase) {}

  @Get(':providerId/wagering/transactions/:externalTransactionId')
  async getTransactionByExternalId(
    @Param('providerId') providerId: string,
    @Param('externalTransactionId') externalTransactionId: string,
    @Res() res: Response,
  ) {
    const tx = await this.getWagerTransactionUseCase.executeByProviderAndExternalId(
      providerId,
      externalTransactionId,
    );

    if (!tx) {
      return res.status(HttpStatus.NOT_FOUND).json({
        statusCode: 404,
        message: 'Wager transaction not found for this provider',
      });
    }
    return res.status(HttpStatus.OK).json(tx);
  }
}
