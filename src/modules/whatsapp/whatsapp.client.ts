import { NestFactory } from '@nestjs/core';
import { Client, LocalAuth, Message } from 'whatsapp-web.js';
import * as qrcode from 'qrcode-terminal';
import { AppModule } from '../../app.module';
import { OutboundRouterService } from './outbound-router.service';
import { WhatsAppSessionService } from './whatsapp.session';
import { WhatsAppService } from './whatsapp.service';

const processedMessages = new Set<string>();
const botStartedAtUnix = Math.floor(Date.now() / 1000);

const ALLOWED_TEST_PHONES = new Set<string>([
    // '77017055919',
]);

async function extractPhoneNumber(message: Message): Promise<string | null> {
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

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['log', 'error', 'warn'],
    });

    const whatsappService = app.get(WhatsAppService);
    const outboundRouter = app.get(OutboundRouterService);
    const sessionService = app.get(WhatsAppSessionService);

    const client = new Client({
        authStrategy: new LocalAuth({
            clientId: 'sevil-kids-main',
        }),
        puppeteer: {
            headless: false,
        },
    });

    client.on('qr', (qr: string) => {
        console.log('QR RECEIVED. Scan it in WhatsApp:');
        qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => {
        console.log('WhatsApp client is ready');
    });

    client.on('authenticated', () => {
        console.log('WhatsApp authenticated');
    });

    client.on('auth_failure', (msg: string) => {
        console.error('WhatsApp auth failure:', msg);
    });

    client.on('disconnected', (reason: string) => {
        console.log('WhatsApp disconnected:', reason);
    });

    outboundRouter.registerTransport(async ({ target, text }) => {
        const sent = await client.sendMessage(target, text);
        return { messageId: sent.id?._serialized || null };
    });

    client.on('message', async (message: Message) => {
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
        } catch (error: any) {
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

            await outboundRouter.sendBotMessage(
                session,
                'Извините, произошла ошибка при обработке сообщения. Попробуйте, пожалуйста, ещё раз чуть позже.',
                {
                    sourceChannel: 'whatsapp-web.js-fallback',
                },
            );
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
                } catch (error: any) {
                    console.error('Outbound queue delivery failed', {
                        target: chatId,
                        messageLogId: item.id,
                        error: error?.message || error,
                    });
                    await outboundRouter.markFailed(item.id, error?.message || 'client.sendMessage failed');
                }
            }
        } catch (error) {
            console.error('Outbound queue worker error:', error);
        }
    }, 2000);

    await client.initialize();
}

bootstrap().catch((error) => {
    console.error('WhatsApp bootstrap error:', error);
    process.exit(1);
});
