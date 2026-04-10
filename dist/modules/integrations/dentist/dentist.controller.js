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
exports.DentistController = void 0;
const common_1 = require("@nestjs/common");
const dentist_service_1 = require("./dentist.service");
let DentistController = class DentistController {
    constructor(dentistService) {
        this.dentistService = dentistService;
    }
    async auth() {
        return this.dentistService.authorize();
    }
    async branches() {
        return this.dentistService.getBranches();
    }
    async doctors(query) {
        return this.dentistService.getDoctors(query);
    }
    async searchPatients(search) {
        return this.dentistService.searchPatients(search);
    }
    async findByPhone(phone) {
        return this.dentistService.findPatientByPhone(phone);
    }
    async createPatient(body) {
        return this.dentistService.createPatient(body);
    }
    async getSchedule(doctorId, branchId, dateFrom, dateTo) {
        return this.dentistService.getSchedule({
            doctorId: Number(doctorId),
            branchId: Number(branchId),
            dateFrom,
            dateTo,
        });
    }
    async getVisits(doctorId, patientId, branchId, dateFrom, dateTo) {
        return this.dentistService.getVisits({
            doctorId: doctorId ? Number(doctorId) : undefined,
            patientId: patientId ? Number(patientId) : undefined,
            branchId: branchId ? Number(branchId) : undefined,
            dateFrom,
            dateTo,
        });
    }
    async createVisit(body) {
        return this.dentistService.createVisit(body);
    }
    async getAvailableSlots(doctorId, branchId, dateFrom, dateTo, slotMinutes) {
        return this.dentistService.getAvailableSlots({
            doctorId: Number(doctorId),
            branchId: Number(branchId),
            dateFrom,
            dateTo,
            slotMinutes: slotMinutes ? Number(slotMinutes) : 30,
        });
    }
};
exports.DentistController = DentistController;
__decorate([
    (0, common_1.Get)('auth'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DentistController.prototype, "auth", null);
__decorate([
    (0, common_1.Get)('branches'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DentistController.prototype, "branches", null);
__decorate([
    (0, common_1.Get)('doctors'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DentistController.prototype, "doctors", null);
__decorate([
    (0, common_1.Get)('patients/search'),
    __param(0, (0, common_1.Query)('search')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DentistController.prototype, "searchPatients", null);
__decorate([
    (0, common_1.Get)('patients/find-by-phone'),
    __param(0, (0, common_1.Query)('phone')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DentistController.prototype, "findByPhone", null);
__decorate([
    (0, common_1.Post)('patients'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DentistController.prototype, "createPatient", null);
__decorate([
    (0, common_1.Get)('schedule'),
    __param(0, (0, common_1.Query)('doctorId')),
    __param(1, (0, common_1.Query)('branchId')),
    __param(2, (0, common_1.Query)('dateFrom')),
    __param(3, (0, common_1.Query)('dateTo')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], DentistController.prototype, "getSchedule", null);
__decorate([
    (0, common_1.Get)('visits'),
    __param(0, (0, common_1.Query)('doctorId')),
    __param(1, (0, common_1.Query)('patientId')),
    __param(2, (0, common_1.Query)('branchId')),
    __param(3, (0, common_1.Query)('dateFrom')),
    __param(4, (0, common_1.Query)('dateTo')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], DentistController.prototype, "getVisits", null);
__decorate([
    (0, common_1.Post)('visits'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DentistController.prototype, "createVisit", null);
__decorate([
    (0, common_1.Get)('available-slots'),
    __param(0, (0, common_1.Query)('doctorId')),
    __param(1, (0, common_1.Query)('branchId')),
    __param(2, (0, common_1.Query)('dateFrom')),
    __param(3, (0, common_1.Query)('dateTo')),
    __param(4, (0, common_1.Query)('slotMinutes')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], DentistController.prototype, "getAvailableSlots", null);
exports.DentistController = DentistController = __decorate([
    (0, common_1.Controller)('dentist'),
    __metadata("design:paramtypes", [dentist_service_1.DentistService])
], DentistController);
//# sourceMappingURL=dentist.controller.js.map