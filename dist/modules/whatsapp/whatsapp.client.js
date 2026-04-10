"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const whatsapp_web_js_1 = require("whatsapp-web.js");
const qrcode = __importStar(require("qrcode-terminal"));
const app_module_1 = require("../../app.module");
const outbound_router_service_1 = require("./outbound-router.service");
const whatsapp_session_1 = require("./whatsapp.session");
const whatsapp_service_1 = require("./whatsapp.service");
const processedMessages = new Set();
const botStartedAtUnix = Math.floor(Date.now() / 1000);
const ALLOWED_TEST_PHONES = new Set([]);
async function extractPhoneNumber(message) {
    const contact = await message.getContact().catch(() => null);
    const chat = await message.getChat().catch(() => null);
    const candidates = [
        contact?.number,
        message?._data?.from,
        message?.id?.remote,
        chat?.id?._serialized,
        chat?.id?.user,
        message.from,
        message.author,
    ].filter(Boolean);
    for (const raw of candidates) {
        const value = String(raw).trim();
        if (!value)
            continue;
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
async function bootstrap() {
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule, {
        logger: ['log', 'error', 'warn'],
    });
    const whatsappService = app.get(whatsapp_service_1.WhatsAppService);
    const outboundRouter = app.get(outbound_router_service_1.OutboundRouterService);
    const sessionService = app.get(whatsapp_session_1.WhatsAppSessionService);
    const client = new whatsapp_web_js_1.Client({
        authStrategy: new whatsapp_web_js_1.LocalAuth({
            clientId: 'sevil-kids-main',
        }),
        puppeteer: {
            headless: false,
        },
    });
    client.on('qr', (qr) => {
        console.log('QR RECEIVED. Scan it in WhatsApp:');
        qrcode.generate(qr, { small: true });
    });
    client.on('ready', () => {
        console.log('WhatsApp client is ready');
    });
    client.on('authenticated', () => {
        console.log('WhatsApp authenticated');
    });
    client.on('auth_failure', (msg) => {
        console.error('WhatsApp auth failure:', msg);
    });
    client.on('disconnected', (reason) => {
        console.log('WhatsApp disconnected:', reason);
    });
    outboundRouter.registerTransport(async ({ target, text }) => {
        const sent = await client.sendMessage(target, text);
        return { messageId: sent.id?._serialized || null };
    });
    client.on('message', async (message) => {
        try {
            if (message.fromMe)
                return;
            if (!message.body?.trim())
                return;
            if (message.from === 'status@broadcast')
                return;
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
            const phoneNumber = await extractPhoneNumber(message);
            if (!phoneNumber) {
                console.warn('Could not extract phone sender', {
                    from: message.from,
                    author: message.author,
                    text: message.body,
                });
                return;
            }
            if (ALLOWED_TEST_PHONES.size > 0 && !ALLOWED_TEST_PHONES.has(phoneNumber)) {
                return;
            }
            const text = message.body.trim();
            const result = await whatsappService.handleIncoming({
                messageId,
                from: message.from,
                phoneNumber,
                text,
                whatsappChatId: message.from,
                externalChatId: message.from,
            });
            await outboundRouter.logIncoming(result.session, {
                text,
                whatsappMessageId: messageId,
                payload: {
                    from: message.from,
                    author: message.author || null,
                },
            });
            if (result.reply && !result.suppressReply) {
                await outboundRouter.sendBotMessage(result.session, result.reply, {
                    sourceChannel: 'whatsapp-web.js',
                });
            }
        }
        catch (error) {
            console.error('WhatsApp message handler error:', error);
            const phoneNumber = await extractPhoneNumber(message);
            if (!phoneNumber) {
                return;
            }
            const session = await sessionService.get(phoneNumber, {
                whatsappChatId: message.from,
                externalChatId: message.from,
            });
            if (error?.reply) {
                await outboundRouter.sendBotMessage(session, error.reply, {
                    sourceChannel: 'whatsapp-web.js-error',
                });
                return;
            }
            await outboundRouter.sendBotMessage(session, 'Извините, произошла ошибка при обработке сообщения. Попробуйте, пожалуйста, ещё раз чуть позже.', {
                sourceChannel: 'whatsapp-web.js-fallback',
            });
        }
    });
    setInterval(async () => {
        try {
            const pendingMessages = await outboundRouter.claimPendingOutgoing();
            for (const item of pendingMessages) {
                const chatId = item.chatSession.whatsappChatId || item.chatSession.externalChatId;
                if (!chatId || !item.text) {
                    await outboundRouter.markFailed(item.id, 'whatsappChatId is missing for outbound delivery');
                    continue;
                }
                try {
                    const sent = await client.sendMessage(chatId, item.text);
                    console.log('Outbound queue delivery success', {
                        target: chatId,
                        messageLogId: item.id,
                        whatsappMessageId: sent.id?._serialized || null,
                    });
                    await outboundRouter.markSent(item.id, sent.id?._serialized || null);
                    await outboundRouter.markDelivered(item.id, {
                        whatsappMessageId: sent.id?._serialized || null,
                    });
                }
                catch (error) {
                    console.error('Outbound queue delivery failed', {
                        target: chatId,
                        messageLogId: item.id,
                        error: error?.message || error,
                    });
                    await outboundRouter.markFailed(item.id, error?.message || 'client.sendMessage failed');
                }
            }
        }
        catch (error) {
            console.error('Outbound queue worker error:', error);
        }
    }, 2000);
    await client.initialize();
}
bootstrap().catch((error) => {
    console.error('WhatsApp bootstrap error:', error);
    process.exit(1);
});
//# sourceMappingURL=whatsapp.client.js.map