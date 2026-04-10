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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var _a, _b, _c, _d, _e, _f;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppController = void 0;
const common_1 = require("@nestjs/common");
const express_1 = require("express");
const prisma_service_1 = require("../../prisma/prisma.service");
const bitrix_openlines_service_1 = require("../integrations/bitrix/bitrix-openlines.service");
const booking_draft_service_1 = require("./booking-draft.service");
const whatsapp_client_service_1 = require("./whatsapp.client.service");
const outbound_router_service_1 = require("./outbound-router.service");
const whatsapp_console_page_1 = require("./whatsapp.console-page");
const whatsapp_script_catalog_1 = require("./whatsapp.script-catalog");
const whatsapp_session_1 = require("./whatsapp.session");
const whatsapp_service_1 = require("./whatsapp.service");
const bitrix_operator_event_dto_1 = require("./dto/bitrix-operator-event.dto");
const chat_console_send_dto_1 = require("./dto/chat-console-send.dto");
const chat_console_toggle_dto_1 = require("./dto/chat-console-toggle.dto");
const bitrix_operator_message_dto_1 = require("./dto/bitrix-operator-message.dto");
const delivery_status_dto_1 = require("./dto/delivery-status.dto");
const incoming_whatsapp_dto_1 = require("./dto/incoming-whatsapp.dto");
const manual_payment_confirm_dto_1 = require("./dto/manual-payment-confirm.dto");
const update_chat_mode_dto_1 = require("./dto/update-chat-mode.dto");
let WhatsAppController = class WhatsAppController {
    constructor(whatsappService, sessionService, outboundRouter, bookingDraftService, bitrixOpenLinesService, whatsappClientService, scriptCatalog, prisma) {
        this.whatsappService = whatsappService;
        this.sessionService = sessionService;
        this.outboundRouter = outboundRouter;
        this.bookingDraftService = bookingDraftService;
        this.bitrixOpenLinesService = bitrixOpenLinesService;
        this.whatsappClientService = whatsappClientService;
        this.scriptCatalog = scriptCatalog;
        this.prisma = prisma;
    }
    getConsolePage() {
        return whatsapp_console_page_1.WHATSAPP_CONSOLE_PAGE;
    }
    async loginToConsole(body) {
        const expectedLogin = process.env.WHATSAPP_CONSOLE_LOGIN || 'sevilkids';
        const expectedPassword = process.env.WHATSAPP_CONSOLE_PASSWORD || 'sevil2026';
        if ((body.login || '').trim() !== expectedLogin || (body.password || '').trim() !== expectedPassword) {
            throw new common_1.UnauthorizedException('Invalid console credentials');
        }
        return {
            ok: true,
            token: Buffer.from(`${expectedLogin}:${expectedPassword}`).toString('base64'),
        };
    }
    async getConsoleStatus(req) {
        this.assertConsoleAuthorized(req);
        return {
            ok: true,
            client: this.whatsappClientService.getClientState(),
        };
    }
    async listChats(req) {
        this.assertConsoleAuthorized(req);
        const sessions = await this.sessionService.listTrackedSessions();
        const sessionIds = sessions.map((session) => session.id).filter(Boolean);
        const latestMessages = new Map();
        if (this.prisma.connected && sessionIds.length > 0) {
            const rows = await this.prisma.chatMessageLog.findMany({
                where: { chatSessionId: { in: sessionIds } },
                orderBy: { createdAt: 'desc' },
                select: {
                    chatSessionId: true,
                    text: true,
                },
            });
            for (const row of rows) {
                if (!latestMessages.has(row.chatSessionId)) {
                    latestMessages.set(row.chatSessionId, { text: row.text });
                }
            }
        }
        return {
            ok: true,
            items: sessions
                .sort((a, b) => String(b.lastIncomingAt || b.lastOutgoingAt || '').localeCompare(String(a.lastIncomingAt || a.lastOutgoingAt || '')))
                .map((session) => ({
                id: session.id,
                displayName: session.patientName || session.phoneNumber || session.normalizedPhone,
                phoneNumber: session.phoneNumber,
                normalizedPhone: session.normalizedPhone,
                currentMode: session.currentMode,
                currentStep: session.currentStep,
                botEnabled: session.botEnabled,
                allowBotReplies: session.allowBotReplies,
                lastIncomingAt: session.lastIncomingAt,
                lastOutgoingAt: session.lastOutgoingAt,
                lastMessageText: session.id ? latestMessages.get(session.id)?.text || null : null,
            })),
        };
    }
    async getChatMessages(sessionId, req) {
        this.assertConsoleAuthorized(req);
        const session = await this.sessionService.findById(sessionId);
        if (!session) {
            throw new common_1.NotFoundException('Chat session not found');
        }
        if (!this.prisma.connected) {
            return { ok: true, items: [] };
        }
        const rows = await this.prisma.chatMessageLog.findMany({
            where: { chatSessionId: sessionId },
            orderBy: { createdAt: 'asc' },
            take: 200,
            select: {
                id: true,
                direction: true,
                source: true,
                text: true,
                createdAt: true,
                deliveryStatus: true,
            },
        });
        return {
            ok: true,
            items: rows.map((row) => ({
                ...row,
                createdAt: row.createdAt.toISOString(),
            })),
        };
    }
    async sendChatMessage(sessionId, body, req) {
        this.assertConsoleAuthorized(req);
        const session = await this.sessionService.findById(sessionId);
        if (!session) {
            throw new common_1.NotFoundException('Chat session not found');
        }
        await this.outboundRouter.sendOperatorMessage(session, body.text.trim(), {
            sourceChannel: 'chat_console',
        });
        return { ok: true, sessionId };
    }
    async toggleBotForChat(sessionId, body, req) {
        this.assertConsoleAuthorized(req);
        const session = await this.sessionService.findById(sessionId);
        if (!session) {
            throw new common_1.NotFoundException('Chat session not found');
        }
        const updated = await this.sessionService.updateMode(session, {
            currentMode: body.enabled ? 'AUTO' : 'HUMAN',
            allowBotReplies: body.enabled,
            handoffReason: body.enabled ? 'chat_console_enabled' : 'chat_console_disabled',
            currentStep: body.enabled
                ? session.currentStep === 'HANDOFF_TO_OPERATOR'
                    ? 'ASK_SERVICE'
                    : session.currentStep
                : 'HANDOFF_TO_OPERATOR',
            markHumanTaken: !body.enabled,
        });
        return {
            ok: true,
            sessionId: updated.id,
            currentMode: updated.currentMode,
            allowBotReplies: updated.allowBotReplies,
            botEnabled: updated.botEnabled,
        };
    }
    assertConsoleAuthorized(req) {
        const expectedLogin = process.env.WHATSAPP_CONSOLE_LOGIN || 'sevilkids';
        const expectedPassword = process.env.WHATSAPP_CONSOLE_PASSWORD || 'sevil2026';
        const expectedToken = Buffer.from(`${expectedLogin}:${expectedPassword}`).toString('base64');
        const headerToken = String(req.headers['x-console-auth'] || '').trim();
        const bearerToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
        const token = headerToken || bearerToken;
        if (token !== expectedToken) {
            throw new common_1.UnauthorizedException('Console auth required');
        }
    }
    async incoming(body) {
        const result = await this.whatsappService.handleIncoming(body);
        if (result.reply && !result.suppressReply) {
            await this.outboundRouter.sendBotMessage(result.session, result.reply, {
                sourceChannel: 'controller',
            });
        }
        return {
            ok: true,
            suppressReply: Boolean(result.suppressReply),
            replyQueued: Boolean(result.reply && !result.suppressReply),
            sessionId: result.session.id,
            currentMode: result.session.currentMode,
            currentStep: result.session.currentStep,
        };
    }
    async operatorMessage(body) {
        const session = await this.sessionService.findById(body.sessionId);
        if (!session) {
            throw new common_1.NotFoundException('Chat session not found');
        }
        await this.sessionService.updateMode(session, {
            currentMode: 'HUMAN',
            allowBotReplies: false,
            assignedOperatorId: body.operatorId || session.assignedOperatorId,
            currentStep: session.currentStep === 'PAYMENT_PENDING' ? 'PAYMENT_PENDING' : 'HANDOFF_TO_OPERATOR',
            markHumanTaken: true,
            handoffReason: session.handoffReason || 'operator_message',
        });
        await this.outboundRouter.sendOperatorMessage(session, body.text, body.payload, {
            bitrixMessageId: body.bitrixMessageId,
        });
        return {
            ok: true,
            sessionId: session.id,
            queued: true,
        };
    }
    async openLineInstall(body, contentType, req) {
        return this.bitrixOpenLinesService.handleInstallCallback(body, {
            contentType: contentType || req.headers['content-type'] || null,
            method: req.method,
        });
    }
    async openLineAppEvent(body) {
        return this.bitrixOpenLinesService.handleAppEvent(body);
    }
    async openLineDelivery(body) {
        return this.bitrixOpenLinesService.handleDeliveryCallback(body);
    }
    async operatorEvent(body) {
        const session = await this.sessionService.findById(body.sessionId);
        if (!session) {
            throw new common_1.NotFoundException('Chat session not found');
        }
        await this.bitrixOpenLinesService.handleOperatorEvent(session, {
            eventType: body.eventType,
            operatorId: body.operatorId,
            lineId: body.lineId,
            chatId: body.chatId,
            dialogId: body.dialogId,
            payload: body.payload,
        });
        await this.sessionService.updateMode(session, {
            currentMode: body.operatorId ? 'HUMAN' : 'WAITING_OPERATOR',
            allowBotReplies: false,
            assignedOperatorId: body.operatorId || session.assignedOperatorId,
            currentStep: 'HANDOFF_TO_OPERATOR',
            markHumanTaken: Boolean(body.operatorId),
            handoffReason: body.eventType,
        });
        return {
            ok: true,
            sessionId: session.id,
            currentMode: session.currentMode,
        };
    }
    async deliveryStatus(body) {
        if (body.status === 'sent') {
            await this.outboundRouter.markSent(body.messageLogId, body.whatsappMessageId);
        }
        else if (body.status === 'delivered') {
            await this.outboundRouter.markDelivered(body.messageLogId, {
                whatsappMessageId: body.whatsappMessageId,
            });
        }
        else {
            await this.outboundRouter.markFailed(body.messageLogId, body.errorMessage || 'unknown delivery failure');
        }
        return { ok: true };
    }
    async updateMode(sessionId, body) {
        const session = await this.sessionService.findById(sessionId);
        if (!session) {
            throw new common_1.NotFoundException('Chat session not found');
        }
        const updated = await this.sessionService.updateMode(session, {
            currentMode: body.currentMode,
            allowBotReplies: body.allowBotReplies,
            assignedOperatorId: body.assignedOperatorId,
            handoffReason: body.handoffReason,
            currentStep: body.currentMode === 'AUTO'
                ? session.currentStep === 'HANDOFF_TO_OPERATOR'
                    ? 'ASK_SERVICE'
                    : session.currentStep
                : 'HANDOFF_TO_OPERATOR',
            markHumanTaken: body.currentMode === 'HUMAN',
        });
        return {
            ok: true,
            sessionId: updated.id,
            currentMode: updated.currentMode,
            allowBotReplies: updated.allowBotReplies,
        };
    }
    async confirmPayment(draftId, body) {
        const result = await this.bookingDraftService.finalizePaidBooking(draftId, {
            confirmedBy: body.confirmedBy,
            paymentProvider: body.paymentProvider,
            note: body.note,
        });
        if (result.draft?.chatSessionId) {
            const session = await this.sessionService.findById(result.draft.chatSessionId);
            if (session && result.visit) {
                await this.sessionService.updateMode(session, {
                    currentMode: 'AUTO',
                    allowBotReplies: true,
                    currentStep: 'BOOKING_CONFIRMED',
                    handoffReason: 'payment_confirmed',
                });
                await this.outboundRouter.sendBotMessage(session, this.scriptCatalog.getAppointmentConfirmation({
                    date: result.draft.selectedStart || '',
                    doctor: session.activeAppointmentDoctorName || `Доктор #${result.visit.doctorId}`,
                }), {
                    sourceChannel: 'manual_payment_confirmation',
                });
            }
        }
        return {
            ok: true,
            draft: result.draft,
            visit: result.visit,
        };
    }
};
exports.WhatsAppController = WhatsAppController;
__decorate([
    (0, common_1.Get)('console'),
    (0, common_1.Header)('Content-Type', 'text/html; charset=utf-8'),
    (0, common_1.Header)('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate'),
    (0, common_1.Header)('Pragma', 'no-cache'),
    (0, common_1.Header)('Expires', '0'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], WhatsAppController.prototype, "getConsolePage", null);
__decorate([
    (0, common_1.Post)('console/login'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], WhatsAppController.prototype, "loginToConsole", null);
__decorate([
    (0, common_1.Get)('console/status'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_a = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _a : Object]),
    __metadata("design:returntype", Promise)
], WhatsAppController.prototype, "getConsoleStatus", null);
__decorate([
    (0, common_1.Get)('chats'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_b = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _b : Object]),
    __metadata("design:returntype", Promise)
], WhatsAppController.prototype, "listChats", null);
__decorate([
    (0, common_1.Get)('chats/:sessionId/messages'),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_c = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _c : Object]),
    __metadata("design:returntype", Promise)
], WhatsAppController.prototype, "getChatMessages", null);
__decorate([
    (0, common_1.Post)('chats/:sessionId/send'),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, chat_console_send_dto_1.ChatConsoleSendDto, typeof (_d = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _d : Object]),
    __metadata("design:returntype", Promise)
], WhatsAppController.prototype, "sendChatMessage", null);
__decorate([
    (0, common_1.Post)('chats/:sessionId/bot-toggle'),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, chat_console_toggle_dto_1.ChatConsoleToggleDto, typeof (_e = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _e : Object]),
    __metadata("design:returntype", Promise)
], WhatsAppController.prototype, "toggleBotForChat", null);
__decorate([
    (0, common_1.Post)('incoming'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [incoming_whatsapp_dto_1.IncomingWhatsAppDto]),
    __metadata("design:returntype", Promise)
], WhatsAppController.prototype, "incoming", null);
__decorate([
    (0, common_1.Post)('bitrix/operator-message'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [bitrix_operator_message_dto_1.BitrixOperatorMessageDto]),
    __metadata("design:returntype", Promise)
], WhatsAppController.prototype, "operatorMessage", null);
__decorate([
    (0, common_1.Post)('bitrix/openline/install'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Headers)('content-type')),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, typeof (_f = typeof express_1.Request !== "undefined" && express_1.Request) === "function" ? _f : Object]),
    __metadata("design:returntype", Promise)
], WhatsAppController.prototype, "openLineInstall", null);
__decorate([
    (0, common_1.Post)('bitrix/openline/app-event'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], WhatsAppController.prototype, "openLineAppEvent", null);
__decorate([
    (0, common_1.Post)('bitrix/openline/delivery'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], WhatsAppController.prototype, "openLineDelivery", null);
__decorate([
    (0, common_1.Post)('bitrix/operator-event'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [bitrix_operator_event_dto_1.BitrixOperatorEventDto]),
    __metadata("design:returntype", Promise)
], WhatsAppController.prototype, "operatorEvent", null);
__decorate([
    (0, common_1.Post)('delivery-status'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [delivery_status_dto_1.DeliveryStatusDto]),
    __metadata("design:returntype", Promise)
], WhatsAppController.prototype, "deliveryStatus", null);
__decorate([
    (0, common_1.Post)('sessions/:sessionId/mode'),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_chat_mode_dto_1.UpdateChatModeDto]),
    __metadata("design:returntype", Promise)
], WhatsAppController.prototype, "updateMode", null);
__decorate([
    (0, common_1.Post)('bookings/:draftId/confirm-payment'),
    __param(0, (0, common_1.Param)('draftId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, manual_payment_confirm_dto_1.ManualPaymentConfirmDto]),
    __metadata("design:returntype", Promise)
], WhatsAppController.prototype, "confirmPayment", null);
exports.WhatsAppController = WhatsAppController = __decorate([
    (0, common_1.Controller)('whatsapp'),
    __metadata("design:paramtypes", [whatsapp_service_1.WhatsAppService,
        whatsapp_session_1.WhatsAppSessionService,
        outbound_router_service_1.OutboundRouterService,
        booking_draft_service_1.BookingDraftService,
        bitrix_openlines_service_1.BitrixOpenLinesService,
        whatsapp_client_service_1.WhatsAppClientService,
        whatsapp_script_catalog_1.WhatsAppScriptCatalog,
        prisma_service_1.PrismaService])
], WhatsAppController);
//# sourceMappingURL=whatsapp.controller.js.map