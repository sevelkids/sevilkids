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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PatientSyncService = void 0;
const common_1 = require("@nestjs/common");
const bitrix_service_1 = require("../integrations/bitrix/bitrix.service");
const dentist_service_1 = require("../integrations/dentist/dentist.service");
let PatientSyncService = class PatientSyncService {
    constructor(dentistService, bitrixService) {
        this.dentistService = dentistService;
        this.bitrixService = bitrixService;
    }
    async ensurePatientEverywhere(input) {
        let patient = await this.dentistService.findPatientByPhone(input.phone);
        let patientCreated = false;
        if (!patient) {
            patient = await this.dentistService.createPatient({
                firstName: input.firstName || 'Новый',
                lastName: input.lastName || 'Пациент',
                middleName: input.middleName,
                phone: input.phone,
                branchId: input.branchId,
            });
            patientCreated = true;
        }
        const bitrix = await this.bitrixService.ensureContactAndRequestDeal({
            phone: input.phone,
            message: input.message,
            firstName: patient.firstName || input.firstName,
            lastName: patient.lastName || input.lastName,
            middleName: patient.middleName || input.middleName,
            fullName: patient.fullName,
            dentistPlusPatientId: patient.id,
        });
        return {
            patient,
            patientCreated,
            bitrix,
        };
    }
};
exports.PatientSyncService = PatientSyncService;
exports.PatientSyncService = PatientSyncService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [dentist_service_1.DentistService,
        bitrix_service_1.BitrixService])
], PatientSyncService);
//# sourceMappingURL=patient-sync.service.js.map