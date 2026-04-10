import { Injectable, Logger } from '@nestjs/common';
import { MessageDeliveryStatus, MessageDirection, MessageSource } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatSession } from './whatsapp.types';
import { WhatsAppHistoryFallbackService } from './whatsapp.history-fallback.service';
import { WhatsAppSessionService } from './whatsapp.session';

type TransportResult =
    | { messageId?: string | null }
    | string
    | null
    | void;

type OutboundTransport = (input: {
    target: string;
    text: string;
    session: ChatSession;
    source: Exclude<MessageSource, 'CLIENT'>;
    payload?: Record<string, unknown>;
}) => Promise<TransportResult>;

@Injectable()
export class OutboundRouterService {
    private readonly logger = new Logger(OutboundRouterService.name);
    private transport: OutboundTransport | null = null;

    constructor(
        private readonly prisma: PrismaService,
        private readonly sessionService: WhatsAppSessionService,
        private readonly historyFallback: WhatsAppHistoryFallbackService,
    ) {}

    registerTransport(transport: OutboundTransport): void {
        this.transport = transport;
        this.logger.log('WhatsApp outbound transport registered');
    }

    async sendBotMessage(
        session: ChatSession,
        text: string,
        payload?: Record<string, unknown>,
    ) {
        if (!text?.trim()) {
            return null;
        }

        if (!this.canBotReply(session)) {
            const reason = this.getBotBlockReason(session);
            this.logger.warn(
                `[OUTBOUND:BOT:SKIPPED] phone=${session.normalizedPhone} mode=${session.currentMode} reason=${reason}`,
            );

            return this.createMessageLog(session, {
                direction: 'OUT',
                source: 'BOT',
                text,
                payload,
                deliveryStatus: 'SKIPPED',
                errorMessage: reason,
            });
        }

        return this.sendOutgoingMessage(session, {
            text,
            source: 'BOT',
            payload,
        });
    }

    async sendOperatorMessage(
        session: ChatSession,
        text: string,
        payload?: Record<string, unknown>,
        refs?: { bitrixMessageId?: string | null; whatsappMessageId?: string | null },
    ) {
        if (!text?.trim()) {
            return null;
        }

        return this.sendOutgoingMessage(session, {
            text,
            source: 'OPERATOR',
            payload,
            bitrixMessageId: refs?.bitrixMessageId || null,
            whatsappMessageId: refs?.whatsappMessageId || null,
        });
    }

    async logIncoming(
        session: ChatSession,
        input: {
            text?: string | null;
            whatsappMessageId?: string | null;
            bitrixMessageId?: string | null;
            payload?: Record<string, unknown>;
        },
    ) {
        return this.createMessageLog(session, {
            direction: 'IN',
            source: 'CLIENT',
            text: input.text || null,
            payload: input.payload,
            whatsappMessageId: input.whatsappMessageId || null,
            bitrixMessageId: input.bitrixMessageId || null,
            deliveryStatus: 'DELIVERED',
        });
    }

    async claimPendingOutgoing(limit = 20) {
        if (!this.prisma.connected) {
            return [];
        }

        return this.prisma.chatMessageLog.findMany({
            where: {
                direction: 'OUT',
                deliveryStatus: 'PENDING',
            },
            include: {
                chatSession: true,
            },
            orderBy: { createdAt: 'asc' },
            take: limit,
        });
    }

    async markSent(messageLogId: string, whatsappMessageId?: string | null) {
        return this.updateDeliveryStatus(messageLogId, {
            deliveryStatus: 'SENT',
            whatsappMessageId: whatsappMessageId || undefined,
            sentAt: new Date(),
        });
    }

    async markDelivered(
        messageLogId: string,
        input?: {
            whatsappMessageId?: string | null;
            bitrixMessageId?: string | null;
        },
    ) {
        return this.updateDeliveryStatus(messageLogId, {
            deliveryStatus: 'DELIVERED',
            whatsappMessageId: input?.whatsappMessageId || undefined,
            bitrixMessageId: input?.bitrixMessageId || undefined,
            deliveredAt: new Date(),
        });
    }

    async markFailed(messageLogId: string, errorMessage: string) {
        return this.updateDeliveryStatus(messageLogId, {
            deliveryStatus: 'FAILED',
            failedAt: new Date(),
            errorMessage,
        });
    }

    private async sendOutgoingMessage(
        session: ChatSession,
        input: {
            text: string;
            source: Exclude<MessageSource, 'CLIENT'>;
            payload?: Record<string, unknown>;
            whatsappMessageId?: string | null;
            bitrixMessageId?: string | null;
        },
    ) {
        const target = this.resolveTarget(session);
        const logRecord = await this.createMessageLog(session, {
            direction: 'OUT',
            source: input.source,
            text: input.text,
            payload: {
                ...(input.payload || {}),
                resolvedTarget: target,
            },
            whatsappMessageId: input.whatsappMessageId || null,
            bitrixMessageId: input.bitrixMessageId || null,
            deliveryStatus: this.transport && target ? 'PENDING' : target ? 'PENDING' : 'FAILED',
            errorMessage: target ? null : 'Outbound target is missing',
        });

        if (!target) {
            this.logger.error(
                `[OUTBOUND:${input.source}] Missing target for phone=${session.normalizedPhone} chatId=${session.whatsappChatId} externalChatId=${session.externalChatId}`,
            );
            if (logRecord?.id) {
                await this.markFailed(logRecord.id, 'Outbound target is missing');
            }
            return logRecord;
        }

        this.logger.log(
            `[OUTBOUND:${input.source}] phone=${session.normalizedPhone} target=${target} mode=${session.currentMode}`,
        );

        if (!this.transport) {
            this.logger.warn(
                `[OUTBOUND:${input.source}] Transport is not registered, message remains queued target=${target}`,
            );
            return logRecord;
        }

        try {
            const transportResult = await this.transport({
                target,
                text: input.text,
                session,
                source: input.source,
                payload: input.payload,
            });

            const whatsappMessageId = this.extractTransportMessageId(transportResult);
            this.logger.log(
                `[OUTBOUND:${input.source}:SENT] phone=${session.normalizedPhone} target=${target} messageId=${whatsappMessageId || 'n/a'}`,
            );

            if (logRecord?.id) {
                await this.markSent(logRecord.id, whatsappMessageId);
                await this.markDelivered(logRecord.id, {
                    whatsappMessageId,
                    bitrixMessageId: input.bitrixMessageId || null,
                });
            }

            session.lastOutgoingAt = new Date().toISOString();
            await this.sessionService.save(session);

            return logRecord;
        } catch (error: any) {
            this.logger.error(
                `[OUTBOUND:${input.source}:ERROR] phone=${session.normalizedPhone} target=${target} error=${error?.message || 'Unknown error'}`,
                error?.stack,
            );

            if (logRecord?.id) {
                await this.markFailed(logRecord.id, error?.message || 'Outbound transport failed');
            }

            return logRecord;
        }
    }

    private resolveTarget(session: ChatSession): string | null {
        const candidates = [
            session.whatsappChatId,
            session.externalChatId,
            this.buildFallbackChatId(session.normalizedPhone),
        ];

        for (const candidate of candidates) {
            const value = String(candidate || '').trim();
            if (value) {
                return value;
            }
        }

        return null;
    }

    private buildFallbackChatId(normalizedPhone: string | null | undefined): string | null {
        const digits = String(normalizedPhone || '').replace(/\D/g, '');
        if (!digits) {
            return null;
        }
        return `${digits}@c.us`;
    }

    private canBotReply(session: ChatSession): boolean {
        return session.currentMode === 'AUTO' && session.botEnabled && session.allowBotReplies;
    }

    private getBotBlockReason(session: ChatSession): string {
        if (session.currentMode !== 'AUTO') {
            return `chat mode is ${session.currentMode}`;
        }
        if (!session.botEnabled) {
            return 'botEnabled=false';
        }
        if (!session.allowBotReplies) {
            return 'allowBotReplies=false';
        }
        return 'unknown bot reply block';
    }

    private async createMessageLog(
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
        if (!this.prisma.connected) {
            return this.historyFallback.createMessage(session, {
                direction: input.direction,
                source: input.source,
                text: input.text,
                payload: input.payload,
                whatsappMessageId: input.whatsappMessageId || null,
                bitrixMessageId: input.bitrixMessageId || null,
                deliveryStatus: input.deliveryStatus,
                errorMessage: input.errorMessage || null,
            });
        }

        const persistedSession = await this.ensureSessionRecord(session);
        if (!persistedSession?.id) {
            return null;
        }

        return this.prisma.chatMessageLog.create({
            data: {
                chatSessionId: persistedSession.id,
                direction: input.direction,
                source: input.source,
                text: input.text,
                payload: (input.payload || {}) as any,
                whatsappMessageId: input.whatsappMessageId || null,
                bitrixMessageId: input.bitrixMessageId || null,
                deliveryStatus: input.deliveryStatus,
                errorMessage: input.errorMessage || null,
                sentAt: input.deliveryStatus === 'SENT' ? new Date() : null,
                deliveredAt: input.deliveryStatus === 'DELIVERED' ? new Date() : null,
                failedAt: input.deliveryStatus === 'FAILED' ? new Date() : null,
            },
        });
    }

    private async ensureSessionRecord(session: ChatSession) {
        if (session.id) {
            return session;
        }

        try {
            return await this.sessionService.save(session);
        } catch (error) {
            this.logger.warn(`Failed to persist session before message log creation: ${session.normalizedPhone}`);
            this.logger.debug(error);
            return session;
        }
    }

    private async updateDeliveryStatus(
        messageLogId: string,
        input: {
            deliveryStatus: MessageDeliveryStatus;
            whatsappMessageId?: string;
            bitrixMessageId?: string;
            sentAt?: Date;
            deliveredAt?: Date;
            failedAt?: Date;
            errorMessage?: string;
        },
    ) {
        if (!this.prisma.connected) {
            return this.historyFallback.updateMessage(messageLogId, input);
        }

        return this.prisma.chatMessageLog.update({
            where: { id: messageLogId },
            data: {
                deliveryStatus: input.deliveryStatus,
                whatsappMessageId: input.whatsappMessageId,
                bitrixMessageId: input.bitrixMessageId,
                sentAt: input.sentAt,
                deliveredAt: input.deliveredAt,
                failedAt: input.failedAt,
                errorMessage: input.errorMessage,
            },
        });
    }

    private extractTransportMessageId(result: TransportResult): string | null {
        if (!result) {
            return null;
        }

        if (typeof result === 'string') {
            return result;
        }

        return result.messageId || null;
    }
}
