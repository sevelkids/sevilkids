"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DoctorsDirectoryService = void 0;
const common_1 = require("@nestjs/common");
const doctors_data_1 = require("./doctors.data");
let DoctorsDirectoryService = class DoctorsDirectoryService {
    constructor() {
        this.doctors = doctors_data_1.DOCTORS_DATA;
    }
    getAll() {
        return this.doctors;
    }
    getByDoctorId(doctorId) {
        return this.doctors.find((doctor) => doctor.doctorId === doctorId);
    }
    getDoctorName(doctorId) {
        return this.getByDoctorId(doctorId)?.fullName ?? `Врач #${doctorId}`;
    }
    getDoctorsByService(serviceCode) {
        return this.doctors.filter((doctor) => Boolean(doctor.services[serviceCode]));
    }
    doctorProvidesService(doctorId, serviceCode) {
        const doctor = this.getByDoctorId(doctorId);
        return Boolean(doctor?.services?.[serviceCode]);
    }
    getServiceDuration(doctorId, serviceCode) {
        const doctor = this.getByDoctorId(doctorId);
        return doctor?.services?.[serviceCode]?.durationMinutes ?? null;
    }
};
exports.DoctorsDirectoryService = DoctorsDirectoryService;
exports.DoctorsDirectoryService = DoctorsDirectoryService = __decorate([
    (0, common_1.Injectable)()
], DoctorsDirectoryService);
//# sourceMappingURL=doctors-directory.service.js.map