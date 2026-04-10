import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
    private readonly logger = new Logger(PrismaService.name);
    private isConnected = false;

    async onModuleInit(): Promise<void> {
        try {
            await this.$connect();
            this.isConnected = true;
            this.logger.log('Prisma connected to database');
        } catch (error) {
            this.isConnected = false;
            this.logger.warn(
                'Database is unavailable right now. App will continue without active DB connection.',
            );
            this.logger.debug(error);
        }
    }

    get connected(): boolean {
        return this.isConnected;
    }
}