import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { ChatSession, MessageDeliveryStatus, MessageDirection, MessageSource } from './whatsapp.types';

type FallbackHistoryItem = {
    id: string;
    normalizedPhone: string;
    direction: MessageDirection;
    source: MessageSource;
    text: string | null;
    payload: Record<string, unknown>;
    whatsappMessageId: string | null;
    bitrixMessageId: string | null;
    deliveryStatus: MessageDeliveryStatus;
    errorMessage: string | null;
    createdAt: string;
    sentAt: string | null;
    deliveredAt: string | null;
    failedAt: string | null;
};

@Injectable()
export class WhatsAppHistoryFallbackService implements OnModuleInit {
    private readonly logger = new Logger(WhatsAppHistoryFallbackService.name);
    private readonly history = new Map<string, FallbackHistoryItem>();
    private persistChain: Promise<void> = Promise.resolve();
    private readonly filePath = join(process.cwd(), 'runtime', 'whatsapp-history.json');

    async onModuleInit(): Promise<void> {
        await mkdir(join(process.cwd(), 'runtime'), { recursive: true }).catch(() => undefined);
        this.history.clear();
        await this.flushToDisk();
        this.logger.log('Temporary WhatsApp JSON history storage initialized and cleared for this run');
    }

    async createMessage(
        session: ChatSession,
        input: {
            direction: MessageDirection;
            source: MessageSource;
            text: string | null;
            payload?: Record<string, unknown>;
            whatsappMessageId?: string | null;
            bitrixMessageId?: string | null;
            deliveryStatus: MessageDeliveryStatus;
            errorMessage?: string | null;
        },
    ) {
        const item: FallbackHistoryItem = {
            id: randomUUID(),
            normalizedPhone: session.normalizedPhone,
            direction: input.direction,
            source: input.source,
            text: input.text,
            payload: input.payload || {},
            whatsappMessageId: input.whatsappMessageId || null,
            bitrixMessageId: input.bitrixMessageId || null,
            deliveryStatus: input.deliveryStatus,
            errorMessage: input.errorMessage || null,
            createdAt: new Date().toISOString(),
            sentAt: input.deliveryStatus === 'SENT' ? new Date().toISOString() : null,
            deliveredAt: input.deliveryStatus === 'DELIVERED' ? new Date().toISOString() : null,
            failedAt: input.deliveryStatus === 'FAILED' ? new Date().toISOString() : null,
        };

        this.history.set(item.id, item);
        await this.scheduleFlush();
        return item;
    }

    async updateMessage(
        id: string,
        input: {
            deliveryStatus?: MessageDeliveryStatus;
            whatsappMessageId?: string;
            bitrixMessageId?: string;
            sentAt?: Date;
            deliveredAt?: Date;
            failedAt?: Date;
            errorMessage?: string;
        },
    ) {
        const item = this.history.get(id);
        if (!item) {
            return null;
        }

        if (input.deliveryStatus) {
            item.deliveryStatus = input.deliveryStatus;
        }
        if (typeof input.whatsappMessageId !== 'undefined') {
            item.whatsappMessageId = input.whatsappMessageId || null;
        }
        if (typeof input.bitrixMessageId !== 'undefined') {
            item.bitrixMessageId = input.bitrixMessageId || null;
        }
        if (typeof input.errorMessage !== 'undefined') {
            item.errorMessage = input.errorMessage || null;
        }
        if (typeof input.sentAt !== 'undefined') {
            item.sentAt = input.sentAt ? input.sentAt.toISOString() : null;
        }
        if (typeof input.deliveredAt !== 'undefined') {
            item.deliveredAt = input.deliveredAt ? input.deliveredAt.toISOString() : null;
        }
        if (typeof input.failedAt !== 'undefined') {
            item.failedAt = input.failedAt ? input.failedAt.toISOString() : null;
        }

        await this.scheduleFlush();
        return item;
    }

    listForSession(session: ChatSession) {
        return Array.from(this.history.values())
            .filter((item) => item.normalizedPhone === session.normalizedPhone)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }

    private async scheduleFlush() {
        this.persistChain = this.persistChain
            .catch(() => undefined)
            .then(() => this.flushToDisk());
        await this.persistChain;
    }

    private async flushToDisk() {
        try {
            await writeFile(
                this.filePath,
                JSON.stringify(
                    {
                        generatedAt: new Date().toISOString(),
                        items: Array.from(this.history.values()),
                    },
                    null,
                    2,
                ),
                'utf8',
            );
        } catch (error: any) {
            this.logger.warn(`Failed to write temporary WhatsApp JSON history: ${error?.message || error}`);
        }
    }
}
