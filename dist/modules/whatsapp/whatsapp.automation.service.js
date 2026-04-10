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
var WhatsAppAutomationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppAutomationService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const whatsapp_session_1 = require("./whatsapp.session");
const bitrix_service_1 = require("../integrations/bitrix/bitrix.service");
let WhatsAppAutomationService = WhatsAppAutomationService_1 = class WhatsAppAutomationService {
    constructor(sessionService, bitrixService) {
        this.sessionService = sessionService;
        this.bitrixService = bitrixService;
        this.logger = new common_1.Logger(WhatsAppAutomationService_1.name);
    }
    async processThinkingTransitions() {
        const now = Date.now();
        const sessions = await this.sessionService.listTrackedSessions();
        for (const session of sessions) {
            if (!session.leadId || !session.leadStage)
                continue;
            if (session.activeAppointmentStatus === 'booked')
                continue;
            if (!session.lastClientMessageAt)
                continue;
            const lastMessageTime = new Date(session.lastClientMessageAt).getTime();
            const minutesSinceLastMessage = (now - lastMessageTime) / 1000 / 60;
            if (session.leadStage !== 'thinking' &&
                session.leadStage !== 'booked' &&
                minutesSinceLastMessage >= 10) {
                await this.bitrixService.updateDealStage(session.leadId, this.bitrixService.getStageIds().requests.stages.THINKING);
                await this.bitrixService.appendDealComment(session.leadId, 'Клиент не ответил в течение 10 минут. Лид переведен в стадию Думает.');
                this.sessionService.markThinking(session);
                await this.sessionService.save(session);
                this.logger.log(`Lead ${session.leadId} moved to THINKING`);
            }
            if (session.leadStage === 'thinking' &&
                session.followupSentAt) {
                const followupAt = new Date(session.followupSentAt).getTime();
                const hoursSinceFollowup = (now - followupAt) / 1000 / 60 / 60;
                if (hoursSinceFollowup >= 24) {
                    await this.bitrixService.closeRequestDealAsLost(session.leadId, 'Лид был в стадии Думает более 24 часов без записи. Обращение закрыто автоматически.');
                    this.sessionService.markClosedWithoutBooking(session);
                    await this.sessionService.save(session);
                    this.logger.log(`Lead ${session.leadId} closed after 24h in THINKING`);
                }
            }
        }
    }
};
exports.WhatsAppAutomationService = WhatsAppAutomationService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_MINUTE),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], WhatsAppAutomationService.prototype, "processThinkingTransitions", null);
exports.WhatsAppAutomationService = WhatsAppAutomationService = WhatsAppAutomationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [whatsapp_session_1.WhatsAppSessionService,
        bitrix_service_1.BitrixService])
], WhatsAppAutomationService);
//# sourceMappingURL=whatsapp.automation.service.js.map