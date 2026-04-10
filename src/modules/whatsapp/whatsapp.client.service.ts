import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Client, LocalAuth, Message } from 'whatsapp-web.js';
import { OutboundRouterService } from './outbound-router.service';
import { WhatsAppSessionService } from './whatsapp.session';
import { WhatsAppService } from './whatsapp.service';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const QRCodeVendor = require('qrcode-terminal/vendor/QRCode');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const QRErrorCorrectLevel = require('qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel');

type WhatsAppClientStatus =
    | 'disabled'
    | 'initializing'
    | 'qr'
    | 'authenticated'
    | 'ready'
    | 'auth_failure'
    | 'disconnected';

const processedMessages = new Set<string>();
const botStartedAtUnix = Math.floor(Date.now() / 1000);

@Injectable()
export class WhatsAppClientService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(WhatsAppClientService.name);
    private readonly enabled = String(process.env.WHATSAPP_EMBEDDED_CLIENT_ENABLED || 'true').toLowerCase() !== 'false';
    private client: Client | null = null;
    private queueTimer: NodeJS.Timeout | null = null;
    private recoveryTimer: NodeJS.Timeout | null = null;
    private status: WhatsAppClientStatus = this.enabled ? 'initializing' : 'disabled';
    private qrValue: string | null = null;
    private qrSvgDataUrl: string | null = null;
    private lastError: string | null = null;
    private lastEventAt: string | null = null;
    private isInitializing = false;
    private readonly uncaughtHandler = (error: unknown) => {
        if (!this.isRecoverableWhatsAppError(error)) {
            return;
        }

        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Recovered WhatsApp runtime error: ${message}`);
        this.scheduleRecovery(message);
    };

    constructor(
        private readonly whatsappService: WhatsAppService,
        private readonly outboundRouter: OutboundRouterService,
        private readonly sessionService: WhatsAppSessionService,
    ) {}

    async onModuleInit(): Promise<void> {
        if (!this.enabled) {
            this.logger.log('Embedded WhatsApp client is disabled by env');
            return;
        }

        process.on('uncaughtException', this.uncaughtHandler);
        process.on('unhandledRejection', this.uncaughtHandler);
        this.startQueueWorker();
        await this.initializeClient();
    }

    async onModuleDestroy(): Promise<void> {
        if (this.queueTimer) {
            clearInterval(this.queueTimer);
            this.queueTimer = null;
        }

        if (this.recoveryTimer) {
            clearTimeout(this.recoveryTimer);
            this.recoveryTimer = null;
        }

        process.off('uncaughtException', this.uncaughtHandler);
        process.off('unhandledRejection', this.uncaughtHandler);

        if (this.client) {
            await this.client.destroy().catch(() => undefined);
            this.client = null;
        }
    }

    getClientState() {
        return {
            enabled: this.enabled,
            status: this.status,
            isReady: this.status === 'ready',
            qrValue: this.qrValue,
            qrSvgDataUrl: this.qrSvgDataUrl,
            lastError: this.lastError,
            lastEventAt: this.lastEventAt,
        };
    }

    private async initializeClient() {
        if (this.isInitializing) {
            return;
        }

        this.isInitializing = true;
        this.setStatus('initializing');

        try {
            if (this.client) {
                await this.client.destroy().catch(() => undefined);
                this.client = null;
            }

            const client = new Client({
                authStrategy: new LocalAuth({
                    clientId: process.env.WHATSAPP_CLIENT_ID || 'sevil-kids-main',
                }),
                puppeteer: {
                    headless: String(process.env.WHATSAPP_HEADLESS || 'false').toLowerCase() === 'true',
                },
            });

            this.client = client;
            this.bindClientEvents(client);

            this.outboundRouter.registerTransport(async ({ target, text }) => {
                if (!this.client) {
                    throw new Error('WhatsApp client is not initialized');
                }
                const sent = await this.client.sendMessage(target, text);
                return { messageId: sent.id?._serialized || null };
            });

            await client.initialize();
        } catch (error: any) {
            const message = error?.message || 'WhatsApp initialize failed';
            if (this.isRecoverableWhatsAppError(error)) {
                this.logger.warn(`WhatsApp initialize transient failure: ${message}`);
                this.scheduleRecovery(message);
            } else {
                this.setStatus('auth_failure', message);
                this.logger.error(`WhatsApp initialize failed: ${message}`, error?.stack);
            }
        } finally {
            this.isInitializing = false;
        }
    }

    private bindClientEvents(client: Client) {
        client.on('qr', async (qr: string) => {
            this.qrValue = qr;
            this.qrSvgDataUrl = this.buildQrSvgDataUrl(qr);
            this.setStatus('qr');
            this.logger.log('WhatsApp QR received and exposed to chat console');
        });

        client.on('ready', () => {
            this.qrValue = null;
            this.qrSvgDataUrl = null;
            this.setStatus('ready', null);
            this.logger.log('WhatsApp client is ready');
        });

        client.on('authenticated', () => {
            this.setStatus('authenticated', null);
            this.logger.log('WhatsApp authenticated');
        });

        client.on('auth_failure', (msg: string) => {
            this.setStatus('auth_failure', msg);
            this.logger.error(`WhatsApp auth failure: ${msg}`);
        });

        client.on('disconnected', (reason: string) => {
            this.setStatus('disconnected', reason);
            this.logger.warn(`WhatsApp disconnected: ${reason}`);
            this.scheduleRecovery(reason);
        });

        client.on('message', async (message: Message) => {
            await this.handleIncomingMessage(message);
        });
    }

    private startQueueWorker() {
        this.queueTimer = setInterval(async () => {
            if (!this.client || this.status !== 'ready') {
                return;
            }

            try {
                const pendingMessages = await this.outboundRouter.claimPendingOutgoing();

                for (const item of pendingMessages) {
                    const chatId = item.chatSession.whatsappChatId || item.chatSession.externalChatId;
                    if (!chatId || !item.text) {
                        await this.outboundRouter.markFailed(item.id, 'whatsappChatId is missing for outbound delivery');
                        continue;
                    }

                    try {
                        const sent = await this.client.sendMessage(chatId, item.text);
                        await this.outboundRouter.markSent(item.id, sent.id?._serialized || null);
                        await this.outboundRouter.markDelivered(item.id, {
                            whatsappMessageId: sent.id?._serialized || null,
                        });
                    } catch (error: any) {
                        await this.outboundRouter.markFailed(item.id, error?.message || 'client.sendMessage failed');
                    }
                }
            } catch (error: any) {
                this.logger.error(`Outbound queue worker error: ${error?.message || error}`, error?.stack);
            }
        }, 2000);
    }

    private async handleIncomingMessage(message: Message) {
        try {
            if (message.fromMe) return;
            if (!message.body?.trim()) return;
            if (message.from === 'status@broadcast') return;

            const messageTimestamp = Number(message.timestamp || 0);
            if (messageTimestamp && messageTimestamp < botStartedAtUnix) {
                return;
            }

            const messageId = message.id._serialized;
            if (processedMessages.has(messageId)) {
                return;
            }

            processedMessages.add(messageId);
            setTimeout(() => processedMessages.delete(messageId), 5 * 60 * 1000);

            const phoneNumber = await this.extractPhoneNumber(message);
            if (!phoneNumber) {
                this.logger.warn(`Could not extract sender for message ${messageId}`);
                return;
            }

            const text = message.body.trim();
            const result = await this.whatsappService.handleIncoming({
                messageId,
                from: message.from,
                phoneNumber,
                text,
                whatsappChatId: message.from,
                externalChatId: message.from,
            });

            await this.outboundRouter.logIncoming(result.session, {
                text,
                whatsappMessageId: messageId,
                payload: {
                    from: message.from,
                    author: message.author || null,
                },
            });

            if (result.reply && !result.suppressReply) {
                await this.outboundRouter.sendBotMessage(result.session, result.reply, {
                    sourceChannel: 'embedded-whatsapp-client',
                });
            }
        } catch (error: any) {
            this.logger.error(`WhatsApp message handler error: ${error?.message || error}`, error?.stack);

            const phoneNumber = await this.extractPhoneNumber(message);
            if (!phoneNumber) {
                return;
            }

            const session = await this.sessionService.get(phoneNumber, {
                whatsappChatId: message.from,
                externalChatId: message.from,
            });

            if (error?.reply) {
                await this.outboundRouter.sendBotMessage(session, error.reply, {
                    sourceChannel: 'embedded-whatsapp-client-error',
                });
            }
        }
    }

    private scheduleRecovery(reason: string | null) {
        if (this.recoveryTimer) {
            return;
        }

        this.setStatus('initializing', reason);
        this.recoveryTimer = setTimeout(async () => {
            this.recoveryTimer = null;
            await this.initializeClient();
        }, 4000);
    }

    private async extractPhoneNumber(message: Message): Promise<string | null> {
        const contact = await message.getContact().catch(() => null);
        const chat = await message.getChat().catch(() => null);
        const candidates = [
            contact?.number,
            (message as any)?._data?.from,
            (message as any)?.id?.remote,
            (chat as any)?.id?._serialized,
            (chat as any)?.id?.user,
            message.from,
            message.author,
        ].filter(Boolean);

        for (const raw of candidates) {
            const value = String(raw).trim();
            if (!value) continue;

            if (value.endsWith('@c.us')) {
                const phone = value.replace('@c.us', '').trim();
                if (/^\d{10,15}$/.test(phone)) {
                    return phone;
                }
            }

            if (/^\d{10,15}$/.test(value)) {
                return value;
            }

            const digits = value.replace(/\D/g, '');
            if (/^\d{10,15}$/.test(digits)) {
                return digits;
            }
        }

        return null;
    }

    private setStatus(status: WhatsAppClientStatus, errorMessage?: string | null) {
        this.status = status;
        this.lastEventAt = new Date().toISOString();
        this.lastError = errorMessage || null;
    }

    private isRecoverableWhatsAppError(error: unknown): boolean {
        const message = error instanceof Error ? error.message : String(error || '');
        return message.includes('Execution context was destroyed') || message.includes('Runtime.callFunctionOn');
    }

    private buildQrSvgDataUrl(qrValue: string): string | null {
        try {
            const qr = new QRCodeVendor(-1, QRErrorCorrectLevel.M);
            qr.addData(qrValue);
            qr.make();

            const moduleCount = qr.getModuleCount();
            const cellSize = 8;
            const margin = 4;
            const size = (moduleCount + margin * 2) * cellSize;
            let path = '';

            for (let row = 0; row < moduleCount; row += 1) {
                for (let col = 0; col < moduleCount; col += 1) {
                    if (!qr.isDark(row, col)) {
                        continue;
                    }

                    const x = (col + margin) * cellSize;
                    const y = (row + margin) * cellSize;
                    path += `M${x} ${y}h${cellSize}v${cellSize}H${x}z `;
                }
            }

            const svg =
                `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">` +
                `<rect width="100%" height="100%" fill="#ffffff"/>` +
                `<path d="${path.trim()}" fill="#111827"/></svg>`;

            return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
        } catch (error: any) {
            this.logger.warn(`Failed to generate QR SVG: ${error?.message || error}`);
            return null;
        }
    }
}
