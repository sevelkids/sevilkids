import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WhatsAppSessionService } from './whatsapp.session';
import { BitrixService } from '../integrations/bitrix/bitrix.service';

@Injectable()
export class WhatsAppAutomationService {
    private readonly logger = new Logger(WhatsAppAutomationService.name);

    constructor(
        private readonly sessionService: WhatsAppSessionService,
        private readonly bitrixService: BitrixService,
    ) {}

    @Cron(CronExpression.EVERY_MINUTE)
    async processThinkingTransitions() {
        const now = Date.now();
        const sessions = await this.sessionService.listTrackedSessions();

        for (const session of sessions) {
            if (!session.leadId || !session.leadStage) continue;
            if (session.activeAppointmentStatus === 'booked') continue;
            if (!session.lastClientMessageAt) continue;

            const lastMessageTime = new Date(session.lastClientMessageAt).getTime();
            const minutesSinceLastMessage = (now - lastMessageTime) / 1000 / 60;

            // Через 10 минут -> пиналка + думает
            if (
                session.leadStage !== 'thinking' &&
                session.leadStage !== 'booked' &&
                minutesSinceLastMessage >= 10
            ) {
                await this.bitrixService.updateDealStage(
                    session.leadId,
                    this.bitrixService.getStageIds().requests.stages.THINKING,
                );

                await this.bitrixService.appendDealComment(
                    session.leadId,
                    'Клиент не ответил в течение 10 минут. Лид переведен в стадию Думает.',
                );

                this.sessionService.markThinking(session);
                await this.sessionService.save(session);
                this.logger.log(`Lead ${session.leadId} moved to THINKING`);
            }

            // Через 24 часа в THINKING -> закрыть
            if (
                session.leadStage === 'thinking' &&
                session.followupSentAt
            ) {
                const followupAt = new Date(session.followupSentAt).getTime();
                const hoursSinceFollowup = (now - followupAt) / 1000 / 60 / 60;

                if (hoursSinceFollowup >= 24) {
                    await this.bitrixService.closeRequestDealAsLost(
                        session.leadId,
                        'Лид был в стадии Думает более 24 часов без записи. Обращение закрыто автоматически.',
                    );

                    this.sessionService.markClosedWithoutBooking(session);
                    await this.sessionService.save(session);
                    this.logger.log(`Lead ${session.leadId} closed after 24h in THINKING`);
                }
            }
        }
    }
}
