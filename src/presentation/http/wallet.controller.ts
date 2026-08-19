import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Query,
  Res,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from "express";
import { CreateWalletUseCase } from '../../application/use-cases/create-wallet.use-case';
import { GetWalletUseCase } from '../../application/use-cases/get-wallet.use-case';
import { GetWalletLedgerUseCase } from '../../application/use-cases/get-wallet-ledger.use-case';
import { ReconcileWalletUseCase } from '../../application/use-cases/reconcile-wallet.use-case';
import { IsString, IsNotEmpty, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { MoneyDto } from './wager.controller';

export class CreateWalletDto {
  @IsString()
  @IsNotEmpty()
  playerId!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => MoneyDto)
  initialBalance?: MoneyDto;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  initialBalanceAmount?: string;

  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}

@Controller('wallets')
export class WalletController {
  constructor(
    private readonly createWalletUseCase: CreateWalletUseCase,
    private readonly getWalletUseCase: GetWalletUseCase,
    private readonly getWalletLedgerUseCase: GetWalletLedgerUseCase,
    private readonly reconcileWalletUseCase: ReconcileWalletUseCase,
  ) {}

  @Post()
  async createWallet(@Body() dto: CreateWalletDto, @Res() res: Response) {
    try {
      const currency = dto.initialBalance?.currency || dto.currency || 'BRL';
      const initialBalanceAmount = dto.initialBalance?.amount || dto.initialBalanceAmount || '0.00';

      const result = await this.createWalletUseCase.execute({
        playerId: dto.playerId,
        currency,
        initialBalanceAmount,
        idempotencyKey: dto.idempotencyKey,
      });

      return res.status(HttpStatus.CREATED).json(result);
    } catch (error: any) {
      if (error.name === 'DomainError') {
        const isConflict = error.code === 'DUPLICATE_WALLET';
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

  @Get(':walletId')
  async getWallet(@Param('walletId') walletId: string, @Res() res: Response) {
    const result = await this.getWalletUseCase.execute({ walletId });
    if (!result) {
      return res.status(HttpStatus.NOT_FOUND).json({
        statusCode: 404,
        message: 'Wallet not found',
      });
    }
    return res.status(HttpStatus.OK).json(result);
  }

  @Get(':walletId/ledger')
  async getWalletLedger(
    @Param('walletId') walletId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    const result = await this.getWalletLedgerUseCase.execute({
      walletId,
      cursor,
      limit: parsedLimit,
    });
    return result;
  }

  @Post(':walletId/reconciliation')
  async reconcileWallet(@Param('walletId') walletId: string, @Res() res: Response) {
    const result = await this.reconcileWalletUseCase.execute({ walletId });
    if (!result) {
      return res.status(HttpStatus.NOT_FOUND).json({
        statusCode: 404,
        message: 'Wallet not found',
      });
    }
    return res.status(HttpStatus.OK).json(result);
  }
}
