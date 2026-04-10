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
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlowController = void 0;
const common_1 = require("@nestjs/common");
const flow_service_1 = require("./flow.service");
let FlowController = class FlowController {
    constructor(flowService) {
        this.flowService = flowService;
    }
    async incomingMessage(body) {
        return this.flowService.processIncomingMessage(body);
    }
    async visitCreated(body) {
        return this.flowService.processSuccessfulVisitCreation(body);
    }
    async patientArrived(body) {
        return this.flowService.processPatientArrived(body);
    }
    async patientNoShow(body) {
        return this.flowService.processPatientNoShow(body);
    }
    async visitCancelled(body) {
        return this.flowService.processVisitCancelled(body);
    }
    async visitRescheduled(body) {
        return this.flowService.processVisitRescheduled(body);
    }
    async sendVisitReminder(body) {
        return this.flowService.processSendVisitReminder(body);
    }
    async syncKnownVisit(body) {
        return this.flowService.processSyncKnownVisit(body);
    }
};
exports.FlowController = FlowController;
__decorate([
    (0, common_1.Post)('incoming-message'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], FlowController.prototype, "incomingMessage", null);
__decorate([
    (0, common_1.Post)('visit-created'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], FlowController.prototype, "visitCreated", null);
__decorate([
    (0, common_1.Post)('patient-arrived'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], FlowController.prototype, "patientArrived", null);
__decorate([
    (0, common_1.Post)('patient-no-show'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], FlowController.prototype, "patientNoShow", null);
__decorate([
    (0, common_1.Post)('visit-cancelled'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], FlowController.prototype, "visitCancelled", null);
__decorate([
    (0, common_1.Post)('visit-rescheduled'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], FlowController.prototype, "visitRescheduled", null);
__decorate([
    (0, common_1.Post)('send-visit-reminder'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], FlowController.prototype, "sendVisitReminder", null);
__decorate([
    (0, common_1.Post)('sync-known-visit'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], FlowController.prototype, "syncKnownVisit", null);
exports.FlowController = FlowController = __decorate([
    (0, common_1.Controller)('flow'),
    __metadata("design:paramtypes", [flow_service_1.FlowService])
], FlowController);
//# sourceMappingURL=flow.controller.js.map