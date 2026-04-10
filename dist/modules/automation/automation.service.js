"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var AutomationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutomationService = void 0;
const common_1 = require("@nestjs/common");
let AutomationService = AutomationService_1 = class AutomationService {
    constructor() {
        this.logger = new common_1.Logger(AutomationService_1.name);
    }
    handleNewIncomingMessage(payload) {
        this.logger.log(`New incoming message from ${payload.phone}: ${payload.message}`);
        return {
            action: 'mark_new_request',
            pipeline: 'Заявки и обращения',
            status: 'Новый',
        };
    }
    handleVisitCreated(payload) {
        this.logger.log(`Visit created for patient ${payload.patientId}`);
        return {
            action: 'move_request_status',
            pipeline: 'Заявки и обращения',
            status: 'Записан',
            whatsappMessage: `Вы записаны на прием ${payload.start}.`,
        };
    }
    handlePatientArrived(payload) {
        this.logger.log(`Patient arrived: ${payload.patientId}`);
        return {
            firstPipeline: {
                pipeline: 'Заявки и обращения',
                status: 'Пришел',
            },
            thirdPipeline: {
                pipeline: 'Дошедшие и повторные',
                status: 'Новые',
            },
        };
    }
    handlePatientNoShow(payload) {
        this.logger.log(`Patient no-show: ${payload.patientId}`);
        return {
            pipeline: 'Заявки и обращения',
            status: 'Не пришел',
            whatsappMessage: 'Вы не смогли прийти? Могу предложить новое время записи.',
        };
    }
};
exports.AutomationService = AutomationService;
exports.AutomationService = AutomationService = AutomationService_1 = __decorate([
    (0, common_1.Injectable)()
], AutomationService);
//# sourceMappingURL=automation.service.js.map