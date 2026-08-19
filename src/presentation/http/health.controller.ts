import { Controller, Get, Res, HttpStatus } from '@nestjs/common';
import type { Response } from "express";
import { EntityManager } from '@mikro-orm/postgresql';
import { SQSClient, ListQueuesCommand } from '@aws-sdk/client-sqs';

@Controller('health')
export class HealthController {
  private readonly sqsClient: SQSClient;

  constructor(private readonly em: EntityManager) {
    this.sqsClient = new SQSClient({
      region: process.env.AWS_REGION || 'us-east-1',
      endpoint: process.env.AWS_SQS_ENDPOINT || 'http://localhost:4566',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
      },
    });
  }

  @Get('live')
  getLive() {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async getReady(@Res() res: Response) {
    let dbStatus = 'down';
    let sqsStatus = 'down';

    try {
      const isConnected = await this.em.getConnection().isConnected();
      if (isConnected) {
        // Execute quick ping query
        await this.em.getConnection().execute('SELECT 1');
        dbStatus = 'up';
      }
    } catch {
      dbStatus = 'down';
    }

    try {
      await this.sqsClient.send(new ListQueuesCommand({ MaxResults: 1 }));
      sqsStatus = 'up';
    } catch {
      sqsStatus = 'down';
    }

    const isHealthy = dbStatus === 'up' && sqsStatus === 'up';

    if (isHealthy) {
      return res.status(HttpStatus.OK).json({
        status: 'ok',
        checks: {
          database: dbStatus,
          sqs: sqsStatus,
        },
        timestamp: new Date().toISOString(),
      });
    }

    return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
      status: 'unavailable',
      checks: {
        database: dbStatus,
        sqs: sqsStatus,
      },
      timestamp: new Date().toISOString(),
    });
  }
}
