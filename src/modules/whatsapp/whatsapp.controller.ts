import { Body, Controller, Get, Header, Headers, NotFoundException, Param, Post, Req, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { BitrixOpenLinesService } from '../integrations/bitrix/bitrix-openlines.service';
import { BookingDraftService } from './booking-draft.service';
import { WhatsAppHistoryFallbackService } from './whatsapp.history-fallback.service';
import { WhatsAppClientService } from './whatsapp.client.service';
import { OutboundRouterService } from './outbound-router.service';
import { WHATSAPP_CONSOLE_PAGE } from './whatsapp.console-page';
import { WhatsAppScriptCatalog } from './whatsapp.script-catalog';
import { WhatsAppSessionService } from './whatsapp.session';
import { WhatsAppService } from './whatsapp.service';
import { BitrixOperatorEventDto } from './dto/bitrix-operator-event.dto';
import { ChatConsoleSendDto } from './dto/chat-console-send.dto';
import { ChatConsoleToggleDto } from './dto/chat-console-toggle.dto';
import { BitrixOperatorMessageDto } from './dto/bitrix-operator-message.dto';
import { DeliveryStatusDto } from './dto/delivery-status.dto';
import { IncomingWhatsAppDto } from './dto/incoming-whatsapp.dto';
import { ManualPaymentConfirmDto } from './dto/manual-payment-confirm.dto';
import { UpdateChatModeDto } from './dto/update-chat-mode.dto';

@Controller('whatsapp')
export class WhatsAppController {
    constructor(
        private readonly whatsappService: WhatsAppService,
        private readonly sessionService: WhatsAppSessionService,
        private readonly outboundRouter: OutboundRouterService,
        private readonly bookingDraftService: BookingDraftService,
        private readonly historyFallback: WhatsAppHistoryFallbackService,
        private readonly bitrixOpenLinesService: BitrixOpenLinesService,
        private readonly whatsappClientService: WhatsAppClientService,
        private readonly scriptCatalog: WhatsAppScriptCatalog,
        private readonly prisma: PrismaService,
    ) {}

    @Get('console')
    @Header('Content-Type', 'text/html; charset=utf-8')
    @Header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    @Header('Pragma', 'no-cache')
    @Header('Expires', '0')
    getConsolePage() {
        return WHATSAPP_CONSOLE_PAGE;
    }

    @Post('console/login')
    async loginToConsole(@Body() body: { login?: string; password?: string }) {
        const expectedLogin = process.env.WHATSAPP_CONSOLE_LOGIN || 'sevilkids';
        const expectedPassword = process.env.WHATSAPP_CONSOLE_PASSWORD || 'sevil2026';

        if ((body.login || '').trim() !== expectedLogin || (body.password || '').trim() !== expectedPassword) {
            throw new UnauthorizedException('Invalid console credentials');
        }

        return {
            ok: true,
            token: Buffer.from(`${expectedLogin}:${expectedPassword}`).toString('base64'),
        };
    }

    @Get('console/status')
    async getConsoleStatus(@Req() req: Request) {
        this.assertConsoleAuthorized(req);

        return {
            ok: true,
            client: this.whatsappClientService.getClientState(),
        };
    }

    @Get('chats')
    async listChats(@Req() req: Request) {
        this.assertConsoleAuthorized(req);
        const sessions = await this.sessionService.listTrackedSessions();
        const sessionIds = sessions.map((session) => session.id).filter(Boolean) as string[];
        const latestMessages = new Map<string, { text: string | null }>();

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
        } else {
            for (const session of sessions) {
                const fallbackItems = this.historyFallback.listForSession(session);
                const lastItem = fallbackItems[fallbackItems.length - 1];
                if (lastItem) {
                    latestMessages.set(session.id || session.normalizedPhone, { text: lastItem.text });
                }
            }
        }

        return {
            ok: true,
            items: sessions
                .sort((a, b) => String(b.lastIncomingAt || b.lastOutgoingAt || '').localeCompare(String(a.lastIncomingAt || a.lastOutgoingAt || '')))
                .map((session) => ({
                    id: session.id,
                    routeKey: session.id || session.normalizedPhone,
                    displayName: session.patientName || session.phoneNumber || session.normalizedPhone,
                    phoneNumber: session.phoneNumber,
                    normalizedPhone: session.normalizedPhone,
                    currentMode: session.currentMode,
                    currentStep: session.currentStep,
                    botEnabled: session.botEnabled,
                    allowBotReplies: session.allowBotReplies,
                    lastIncomingAt: session.lastIncomingAt,
                    lastOutgoingAt: session.lastOutgoingAt,
                    lastMessageText:
                        latestMessages.get(session.id || session.normalizedPhone)?.text || null,
                })),
        };
    }

    @Get('chats/:sessionKey/messages')
    async getChatMessages(@Param('sessionKey') sessionKey: string, @Req() req: Request) {
        this.assertConsoleAuthorized(req);
        const session = await this.sessionService.findByRouteKey(sessionKey);
        if (!session) {
            throw new NotFoundException('Chat session not found');
        }

        if (!this.prisma.connected || !session.id) {
            return {
                ok: true,
                storageAvailable: false,
                items: this.historyFallback.listForSession(session).map((item) => ({
                    id: item.id,
                    direction: item.direction,
                    source: item.source,
                    text: item.text,
                    createdAt: item.createdAt,
                    deliveryStatus: item.deliveryStatus,
                })),
            };
        }

        const rows = await this.prisma.chatMessageLog.findMany({
            where: { chatSessionId: session.id! },
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
            storageAvailable: true,
            items: rows.map((row) => ({
                ...row,
                createdAt: row.createdAt.toISOString(),
            })),
        };
    }

    @Post('chats/:sessionKey/send')
    async sendChatMessage(@Param('sessionKey') sessionKey: string, @Body() body: ChatConsoleSendDto, @Req() req: Request) {
        this.assertConsoleAuthorized(req);
        const session = await this.sessionService.findByRouteKey(sessionKey);
        if (!session) {
            throw new NotFoundException('Chat session not found');
        }

        await this.outboundRouter.sendOperatorMessage(session, body.text.trim(), {
            sourceChannel: 'chat_console',
        });

        return { ok: true, sessionId: session.id, routeKey: session.id || session.normalizedPhone };
    }

    @Post('chats/:sessionKey/bot-toggle')
    async toggleBotForChat(@Param('sessionKey') sessionKey: string, @Body() body: ChatConsoleToggleDto, @Req() req: Request) {
        this.assertConsoleAuthorized(req);
        const session = await this.sessionService.findByRouteKey(sessionKey);
        if (!session) {
            throw new NotFoundException('Chat session not found');
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
            routeKey: updated.id || updated.normalizedPhone,
            currentMode: updated.currentMode,
            allowBotReplies: updated.allowBotReplies,
            botEnabled: updated.botEnabled,
        };
    }

    private assertConsoleAuthorized(req: Request) {
        const expectedLogin = process.env.WHATSAPP_CONSOLE_LOGIN || 'sevilkids';
        const expectedPassword = process.env.WHATSAPP_CONSOLE_PASSWORD || 'sevil2026';
        const expectedToken = Buffer.from(`${expectedLogin}:${expectedPassword}`).toString('base64');
        const headerToken = String(req.headers['x-console-auth'] || '').trim();
        const bearerToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
        const token = headerToken || bearerToken;

        if (token !== expectedToken) {
            throw new UnauthorizedException('Console auth required');
        }
    }

    @Post('incoming')
    async incoming(@Body() body: IncomingWhatsAppDto) {
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

    @Post('bitrix/operator-message')
    async operatorMessage(@Body() body: BitrixOperatorMessageDto) {
        const session = await this.sessionService.findById(body.sessionId);
        if (!session) {
            throw new NotFoundException('Chat session not found');
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

    @Post('bitrix/openline/install')
    async openLineInstall(
        @Body() body: Record<string, unknown>,
        @Headers('content-type') contentType: string | undefined,
        @Req() req: Request,
    ) {
        return this.bitrixOpenLinesService.handleInstallCallback(body, {
            contentType: contentType || req.headers['content-type'] || null,
            method: req.method,
        });
    }

    @Post('bitrix/openline/app-event')
    async openLineAppEvent(@Body() body: Record<string, unknown>) {
        return this.bitrixOpenLinesService.handleAppEvent(body);
    }

    @Post('bitrix/openline/delivery')
    async openLineDelivery(@Body() body: Record<string, unknown>) {
        return this.bitrixOpenLinesService.handleDeliveryCallback(body);
    }

    @Post('bitrix/operator-event')
    async operatorEvent(@Body() body: BitrixOperatorEventDto) {
        const session = await this.sessionService.findById(body.sessionId);
        if (!session) {
            throw new NotFoundException('Chat session not found');
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

    @Post('delivery-status')
    async deliveryStatus(@Body() body: DeliveryStatusDto) {
        if (body.status === 'sent') {
            await this.outboundRouter.markSent(body.messageLogId, body.whatsappMessageId);
        } else if (body.status === 'delivered') {
            await this.outboundRouter.markDelivered(body.messageLogId, {
                whatsappMessageId: body.whatsappMessageId,
            });
        } else {
            await this.outboundRouter.markFailed(body.messageLogId, body.errorMessage || 'unknown delivery failure');
        }

        return { ok: true };
    }

    @Post('sessions/:sessionId/mode')
    async updateMode(@Param('sessionId') sessionId: string, @Body() body: UpdateChatModeDto) {
        const session = await this.sessionService.findById(sessionId);
        if (!session) {
            throw new NotFoundException('Chat session not found');
        }

        const updated = await this.sessionService.updateMode(session, {
            currentMode: body.currentMode,
            allowBotReplies: body.allowBotReplies,
            assignedOperatorId: body.assignedOperatorId,
            handoffReason: body.handoffReason,
            currentStep:
                body.currentMode === 'AUTO'
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

    @Post('bookings/:draftId/confirm-payment')
    async confirmPayment(@Param('draftId') draftId: string, @Body() body: ManualPaymentConfirmDto) {
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

                await this.outboundRouter.sendBotMessage(
                    session,
                    this.scriptCatalog.getAppointmentConfirmation({
                        date: result.draft.selectedStart || '',
                        doctor: session.activeAppointmentDoctorName || `Доктор #${result.visit.doctorId}`,
                    }),
                    {
                        sourceChannel: 'manual_payment_confirmation',
                    },
                );
            }
        }

        return {
            ok: true,
            draft: result.draft,
            visit: result.visit,
        };
    }
}
