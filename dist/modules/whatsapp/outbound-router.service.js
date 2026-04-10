"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var OutboundRouterService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutboundRouterService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const whatsapp_session_1 = require("./whatsapp.session");
let OutboundRouterService = OutboundRouterService_1 = class OutboundRouterService {
    constructor(prisma, sessionService) {
        this.prisma = prisma;
        this.sessionService = sessionService;
        this.logger = new common_1.Logger(OutboundRouterService_1.name);
        this.transport = null;
    }
    registerTransport(transport) {
        this.transport = transport;
        this.logger.log('WhatsApp outbound transport registered');
    }
    async sendBotMessage(session, text, payload) {
        if (!text?.trim()) {
            return null;
        }
        if (!this.canBotReply(session)) {
            const reason = this.getBotBlockReason(session);
            this.logger.warn(`[OUTBOUND:BOT:SKIPPED] phone=${session.normalizedPhone} mode=${session.currentMode} reason=${reason}`);
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
    async sendOperatorMessage(session, text, payload, refs) {
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
    async logIncoming(session, input) {
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
    async markSent(messageLogId, whatsappMessageId) {
        return this.updateDeliveryStatus(messageLogId, {
            deliveryStatus: 'SENT',
            whatsappMessageId: whatsappMessageId || undefined,
            sentAt: new Date(),
        });
    }
    async markDelivered(messageLogId, input) {
        return this.updateDeliveryStatus(messageLogId, {
            deliveryStatus: 'DELIVERED',
            whatsappMessageId: input?.whatsappMessageId || undefined,
            bitrixMessageId: input?.bitrixMessageId || undefined,
            deliveredAt: new Date(),
        });
    }
    async markFailed(messageLogId, errorMessage) {
        return this.updateDeliveryStatus(messageLogId, {
            deliveryStatus: 'FAILED',
            failedAt: new Date(),
            errorMessage,
        });
    }
    async sendOutgoingMessage(session, input) {
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
            this.logger.error(`[OUTBOUND:${input.source}] Missing target for phone=${session.normalizedPhone} chatId=${session.whatsappChatId} externalChatId=${session.externalChatId}`);
            if (logRecord?.id) {
                await this.markFailed(logRecord.id, 'Outbound target is missing');
            }
            return logRecord;
        }
        this.logger.log(`[OUTBOUND:${input.source}] phone=${session.normalizedPhone} target=${target} mode=${session.currentMode}`);
        if (!this.transport) {
            this.logger.warn(`[OUTBOUND:${input.source}] Transport is not registered, message remains queued target=${target}`);
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
            this.logger.log(`[OUTBOUND:${input.source}:SENT] phone=${session.normalizedPhone} target=${target} messageId=${whatsappMessageId || 'n/a'}`);
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
        }
        catch (error) {
            this.logger.error(`[OUTBOUND:${input.source}:ERROR] phone=${session.normalizedPhone} target=${target} error=${error?.message || 'Unknown error'}`, error?.stack);
            if (logRecord?.id) {
                await this.markFailed(logRecord.id, error?.message || 'Outbound transport failed');
            }
            return logRecord;
        }
    }
    resolveTarget(session) {
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
    buildFallbackChatId(normalizedPhone) {
        const digits = String(normalizedPhone || '').replace(/\D/g, '');
        if (!digits) {
            return null;
        }
        return `${digits}@c.us`;
    }
    canBotReply(session) {
        return session.currentMode === 'AUTO' && session.botEnabled && session.allowBotReplies;
    }
    getBotBlockReason(session) {
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
    async createMessageLog(session, input) {
        if (!this.prisma.connected) {
            return null;
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
                payload: (input.payload || {}),
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
    async ensureSessionRecord(session) {
        if (session.id) {
            return session;
        }
        try {
            return await this.sessionService.save(session);
        }
        catch (error) {
            this.logger.warn(`Failed to persist session before message log creation: ${session.normalizedPhone}`);
            this.logger.debug(error);
            return session;
        }
    }
    async updateDeliveryStatus(messageLogId, input) {
        if (!this.prisma.connected) {
            return null;
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
    extractTransportMessageId(result) {
        if (!result) {
            return null;
        }
        if (typeof result === 'string') {
            return result;
        }
        return result.messageId || null;
    }
};
exports.OutboundRouterService = OutboundRouterService;
exports.OutboundRouterService = OutboundRouterService = OutboundRouterService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        whatsapp_session_1.WhatsAppSessionService])
], OutboundRouterService);
//# sourceMappingURL=outbound-router.service.js.map