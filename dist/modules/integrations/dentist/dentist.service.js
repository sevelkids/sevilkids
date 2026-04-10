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
exports.DentistService = void 0;
const common_1 = require("@nestjs/common");
const dentist_config_1 = require("../../../config/dentist.config");
const dentist_client_1 = require("./dentist.client");
let DentistService = class DentistService {
    constructor(dentistClient) {
        this.dentistClient = dentistClient;
    }
    normalizePhone(phone) {
        return phone.replace(/\D/g, '');
    }
    cleanNamePart(value) {
        if (!value)
            return null;
        const cleaned = value.trim();
        if (!cleaned)
            return null;
        if (/^[,.\-_\s]+$/.test(cleaned)) {
            return null;
        }
        return cleaned;
    }
    buildFullName(parts) {
        return parts
            .filter((part) => Boolean(part && part.trim()))
            .join(' ');
    }
    parseDentistDateTime(value) {
        return new Date(value.replace(' ', 'T'));
    }
    combineDateAndTime(day, time) {
        return new Date(`${day}T${time}`);
    }
    formatDateTime(date) {
        const pad = (n) => String(n).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }
    addMinutes(date, minutes) {
        return new Date(date.getTime() + minutes * 60 * 1000);
    }
    mergeBusyIntervals(intervals) {
        if (!intervals.length)
            return [];
        const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
        const merged = [sorted[0]];
        for (let i = 1; i < sorted.length; i++) {
            const current = sorted[i];
            const last = merged[merged.length - 1];
            if (current.start.getTime() <= last.end.getTime()) {
                if (current.end.getTime() > last.end.getTime()) {
                    last.end = current.end;
                }
            }
            else {
                merged.push({ start: current.start, end: current.end });
            }
        }
        return merged;
    }
    mapVisit(visit) {
        return {
            id: visit.id,
            patientId: visit.patient_id,
            doctorId: visit.doctor_id,
            branchId: visit.branch_id,
            start: visit.start,
            end: visit.end,
            description: visit.description,
            status: visit.status,
            createdAt: visit.created_at,
            updatedAt: visit.updated_at,
        };
    }
    async authorize() {
        const token = await this.dentistClient.authorize();
        return {
            ok: true,
            tokenPreview: token.slice(0, 12) + '...',
        };
    }
    async getBranches() {
        const response = await this.dentistClient.getBranches();
        return response.data.map((branch) => ({
            id: branch.id,
            title: branch.title,
            address: branch.address,
            phone: branch.phone,
            email: branch.email,
        }));
    }
    async getDoctors(params) {
        const response = await this.dentistClient.getDoctors(params);
        return response.data.map((doctor) => {
            const firstName = this.cleanNamePart(doctor.fname);
            const lastName = this.cleanNamePart(doctor.lname);
            const middleName = this.cleanNamePart(doctor.mname);
            return {
                id: doctor.id,
                fullName: this.buildFullName([lastName, firstName, middleName]) ||
                    firstName ||
                    'Без имени',
                firstName,
                lastName,
                middleName,
                phone: doctor.phone,
                email: doctor.email,
                branches: doctor.branches.map((branch) => ({
                    id: branch.id,
                    title: branch.title,
                })),
                professions: doctor.professions.map((profession) => profession.title),
                color: doctor.color,
                deleted: doctor.deleted,
            };
        });
    }
    async searchPatients(search) {
        const response = await this.dentistClient.searchPatients(search);
        return response.data.map((patient) => {
            const firstName = this.cleanNamePart(patient.fname);
            const lastName = this.cleanNamePart(patient.lname);
            const middleName = this.cleanNamePart(patient.mname);
            return {
                id: patient.id,
                fullName: this.buildFullName([lastName, firstName, middleName]) ||
                    firstName ||
                    'Без имени',
                firstName,
                lastName,
                middleName,
                phone: patient.phone,
                phone2: patient.phone_2,
                email: patient.email,
                gender: patient.gender,
                dateOfBirth: patient.date_of_birth,
            };
        });
    }
    async findPatientByPhone(phone) {
        const normalizedInput = this.normalizePhone(phone);
        const response = await this.dentistClient.searchPatients(phone);
        const patients = response.data.map((patient) => {
            const firstName = this.cleanNamePart(patient.fname);
            const lastName = this.cleanNamePart(patient.lname);
            const middleName = this.cleanNamePart(patient.mname);
            return {
                id: patient.id,
                fullName: this.buildFullName([lastName, firstName, middleName]) ||
                    firstName ||
                    'Без имени',
                firstName,
                lastName,
                middleName,
                phone: patient.phone,
                phone2: patient.phone_2,
                email: patient.email,
                gender: patient.gender,
                dateOfBirth: patient.date_of_birth,
            };
        });
        const exactMatch = patients.find((patient) => {
            const p1 = patient.phone ? this.normalizePhone(patient.phone) : '';
            const p2 = patient.phone2 ? this.normalizePhone(patient.phone2) : '';
            return p1 === normalizedInput || p2 === normalizedInput;
        });
        return exactMatch || null;
    }
    async createPatient(input) {
        const payload = {
            branch_id: input.branchId ?? dentist_config_1.dentistConfig.defaultBranchId,
            fname: input.firstName,
            lname: input.lastName || dentist_config_1.dentistConfig.defaultPatientLastName,
            mname: input.middleName,
            phone: input.phone,
            phone_2: input.phone2,
            email: input.email,
            gender: input.gender,
            date_of_birth: input.dateOfBirth,
        };
        const patient = await this.dentistClient.createPatient(payload);
        const firstName = this.cleanNamePart(patient.fname);
        const lastName = this.cleanNamePart(patient.lname);
        const middleName = this.cleanNamePart(patient.mname);
        return {
            id: patient.id,
            fullName: this.buildFullName([lastName, firstName, middleName]) ||
                firstName ||
                'Без имени',
            firstName,
            lastName,
            middleName,
            phone: patient.phone,
            phone2: patient.phone_2,
            email: patient.email,
            gender: patient.gender,
            dateOfBirth: patient.date_of_birth,
        };
    }
    async getSchedule(input) {
        const response = await this.dentistClient.getSchedule({
            doctor_id: input.doctorId,
            branch_id: input.branchId,
            date_from: input.dateFrom,
            date_to: input.dateTo,
        });
        return response.map((item) => ({
            doctorId: item.doctor_id,
            branchId: item.branch_id,
            day: item.day,
            timeFrom: item.time_from,
            timeTo: item.time_to,
            minutes: item.minutes,
        }));
    }
    async getVisits(input) {
        const response = await this.dentistClient.getVisits({
            doctor_id: input.doctorId,
            patient_id: input.patientId,
            branch_id: input.branchId,
            date_from: input.dateFrom,
            date_to: input.dateTo,
            ids: input.ids,
            with_deleted: input.withDeleted ? 1 : undefined,
            detailed: input.detailed ? 1 : undefined,
        });
        return response.data.map((visit) => this.mapVisit(visit));
    }
    async getVisit(visitId) {
        const visit = await this.dentistClient.getVisit(visitId);
        return this.mapVisit(visit);
    }
    async createVisit(input) {
        const payload = {
            branch_id: input.branchId,
            patient_id: input.patientId,
            doctor_id: input.doctorId,
            start: input.start,
            end: input.end,
            description: input.description,
        };
        const visit = await this.dentistClient.createVisit(payload);
        return this.mapVisit(visit);
    }
    async updateVisit(input) {
        const visit = await this.dentistClient.updateVisit(input.visitId, {
            branch_id: input.branchId,
            patient_id: input.patientId,
            doctor_id: input.doctorId,
            start: input.start,
            end: input.end,
            description: input.description,
            status_id: input.statusId,
        });
        return this.mapVisit(visit);
    }
    async cancelVisit(input) {
        const ok = await this.dentistClient.cancelVisit(input.visitId, input.reason);
        return {
            ok: Boolean(ok),
            visitId: input.visitId,
            reason: input.reason,
        };
    }
    async getAvailableSlots(input) {
        const slotMinutes = input.slotMinutes && input.slotMinutes > 0 ? input.slotMinutes : 30;
        const [schedule, visits] = await Promise.all([
            this.dentistClient.getSchedule({
                doctor_id: input.doctorId,
                branch_id: input.branchId,
                date_from: input.dateFrom,
                date_to: input.dateTo,
            }),
            this.dentistClient.getVisits({
                doctor_id: input.doctorId,
                branch_id: input.branchId,
                date_from: input.dateFrom,
                date_to: input.dateTo,
            }),
        ]);
        const visitItems = visits.data.map((visit) => ({
            start: this.parseDentistDateTime(visit.start),
            end: this.parseDentistDateTime(visit.end),
            status: visit.status,
        }));
        const result = schedule.map((workday) => {
            const dayStart = this.combineDateAndTime(workday.day, workday.time_from);
            const dayEnd = this.combineDateAndTime(workday.day, workday.time_to);
            const busyIntervals = visitItems
                .filter((visit) => {
                return (visit.start.getTime() < dayEnd.getTime() &&
                    visit.end.getTime() > dayStart.getTime());
            })
                .map((visit) => ({
                start: visit.start < dayStart ? dayStart : visit.start,
                end: visit.end > dayEnd ? dayEnd : visit.end,
            }));
            const mergedBusy = this.mergeBusyIntervals(busyIntervals);
            const slots = [];
            let cursor = new Date(dayStart);
            for (const busy of mergedBusy) {
                while (cursor.getTime() + slotMinutes * 60 * 1000 <=
                    busy.start.getTime()) {
                    const slotStart = new Date(cursor);
                    const slotEnd = this.addMinutes(slotStart, slotMinutes);
                    slots.push({
                        start: this.formatDateTime(slotStart),
                        end: this.formatDateTime(slotEnd),
                    });
                    cursor = slotEnd;
                }
                if (cursor.getTime() < busy.end.getTime()) {
                    cursor = new Date(busy.end);
                }
            }
            while (cursor.getTime() + slotMinutes * 60 * 1000 <=
                dayEnd.getTime()) {
                const slotStart = new Date(cursor);
                const slotEnd = this.addMinutes(slotStart, slotMinutes);
                slots.push({
                    start: this.formatDateTime(slotStart),
                    end: this.formatDateTime(slotEnd),
                });
                cursor = slotEnd;
            }
            return {
                doctorId: input.doctorId,
                branchId: input.branchId,
                day: workday.day,
                slots,
            };
        });
        return result;
    }
};
exports.DentistService = DentistService;
exports.DentistService = DentistService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [dentist_client_1.DentistClient])
], DentistService);
//# sourceMappingURL=dentist.service.js.map