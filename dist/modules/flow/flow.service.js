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
exports.FlowService = void 0;
const common_1 = require("@nestjs/common");
const bitrix_service_1 = require("../integrations/bitrix/bitrix.service");
const dentist_service_1 = require("../integrations/dentist/dentist.service");
const patient_sync_service_1 = require("./patient-sync.service");
const doctors_directory_service_1 = require("../doctors/doctors-directory.service");
let FlowService = class FlowService {
    constructor(dentistService, bitrixService, patientSyncService, doctorsDirectoryService) {
        this.dentistService = dentistService;
        this.bitrixService = bitrixService;
        this.patientSyncService = patientSyncService;
        this.doctorsDirectoryService = doctorsDirectoryService;
    }
    formatDoctorLabel(doctorId) {
        if (!doctorId) {
            return 'Врач не указан';
        }
        return this.doctorsDirectoryService.getDoctorName(Number(doctorId));
    }
    formatVisitDate(dateTime) {
        if (!dateTime) {
            return 'Дата не указана';
        }
        const [datePart] = dateTime.split(' ');
        const [year, month, day] = datePart.split('-');
        if (!year || !month || !day) {
            return dateTime;
        }
        return `${day}.${month}.${year}`;
    }
    formatVisitTimeRange(start, end) {
        if (!start || !end) {
            return 'Время не указано';
        }
        const startTime = start.split(' ')[1]?.slice(0, 5);
        const endTime = end.split(' ')[1]?.slice(0, 5);
        if (!startTime || !endTime) {
            return `${start} - ${end}`;
        }
        return `${startTime}–${endTime}`;
    }
    isCancelledStatus(status) {
        if (!status) {
            return false;
        }
        const raw = typeof status === 'string'
            ? status
            : typeof status === 'object'
                ? JSON.stringify(status)
                : String(status);
        const normalized = raw.toLowerCase();
        return (normalized.includes('cancel') ||
            normalized.includes('canceled') ||
            normalized.includes('cancelled') ||
            normalized.includes('отмен'));
    }
    normalizeStatusForKey(status) {
        if (!status) {
            return 'unknown';
        }
        if (typeof status === 'string') {
            return status.trim().toLowerCase();
        }
        try {
            return JSON.stringify(status).toLowerCase();
        }
        catch {
            return String(status).toLowerCase();
        }
    }
    commentAlreadyExists(existingComments, comment) {
        const existing = (existingComments || '').trim();
        const next = (comment || '').trim();
        if (!existing || !next) {
            return false;
        }
        return existing.includes(next);
    }
    async appendCommentIfChanged(dealId, existingComments, comment) {
        if (!dealId) {
            return false;
        }
        if (this.commentAlreadyExists(existingComments, comment)) {
            return false;
        }
        await this.bitrixService.appendDealComment(dealId, comment);
        return true;
    }
    async updateStageIfNeeded(dealId, currentStageId, targetStageId) {
        if (!dealId) {
            return false;
        }
        if (currentStageId === targetStageId) {
            return false;
        }
        await this.bitrixService.updateDealStage(dealId, targetStageId);
        return true;
    }
    async resolveBitrixState(patientId, visitId) {
        const contact = await this.bitrixService.findContactByDentistPlusPatientId(patientId);
        let requestDeal = null;
        if (contact?.ID) {
            requestDeal = await this.bitrixService.findOpenRequestDealByContactId(Number(contact.ID));
        }
        const visitDeal = await this.bitrixService.findVisitDealByDentistPlusVisitId(visitId);
        return {
            contactId: contact?.ID ? Number(contact.ID) : null,
            requestDealId: requestDeal?.ID ? Number(requestDeal.ID) : null,
            visitDealId: visitDeal?.ID ? Number(visitDeal.ID) : null,
            requestDeal,
            visitDeal,
        };
    }
    async processIncomingMessage(input) {
        const syncResult = await this.patientSyncService.ensurePatientEverywhere(input);
        return {
            ok: true,
            patientCreated: syncResult.patientCreated,
            patient: syncResult.patient,
            bitrix: {
                contactId: syncResult.bitrix.contactId,
                dealId: syncResult.bitrix.dealId,
                contactCreated: syncResult.bitrix.contactCreated,
                dealCreated: syncResult.bitrix.dealCreated,
            },
            nextAction: 'continue_booking_or_operator_processing',
        };
    }
    async processSuccessfulVisitCreation(input) {
        const visit = await this.dentistService.createVisit({
            patientId: input.patientId,
            doctorId: input.doctorId,
            branchId: input.branchId,
            start: input.start,
            end: input.end,
            description: input.description,
        });
        const resolvedPatientId = visit?.patientId ?? input.patientId;
        const resolvedDoctorId = visit?.doctorId ?? input.doctorId;
        const resolvedBranchId = visit?.branchId ?? input.branchId;
        const resolvedStart = visit?.start ?? input.start;
        const resolvedEnd = visit?.end ?? input.end;
        const resolvedVisitId = visit?.id;
        if (!resolvedPatientId) {
            throw new Error('Visit created but patientId is missing');
        }
        if (!resolvedVisitId) {
            throw new Error('Visit created but visit.id is missing');
        }
        const doctorName = this.formatDoctorLabel(resolvedDoctorId);
        const formattedDate = this.formatVisitDate(resolvedStart);
        const formattedTime = this.formatVisitTimeRange(resolvedStart, resolvedEnd);
        const visitComment = [
            'Создан визит в Dentist Plus',
            `Врач: ${doctorName}`,
            `Дата: ${formattedDate}`,
            `Время: ${formattedTime}`,
            `Dentist Plus visitId=${resolvedVisitId}`,
        ].join('\n');
        const bitrix = await this.bitrixService.ensureVisitDealAndMoveRequest({
            patientId: resolvedPatientId,
            doctorId: resolvedDoctorId,
            branchId: resolvedBranchId,
            start: resolvedStart,
            end: resolvedEnd,
            dentistPlusVisitId: resolvedVisitId,
            visitComment,
        });
        return {
            ok: true,
            visit,
            bitrix,
            meta: {
                doctorName,
                formattedDate,
                formattedTime,
            },
        };
    }
    async processPatientArrived(input) {
        const state = await this.resolveBitrixState(input.patientId, input.visitId);
        if (state.requestDealId) {
            await this.bitrixService.appendDealComment(state.requestDealId, `Пациент пришел на визит. Dentist Plus visitId=${input.visitId}`);
        }
        if (state.visitDealId) {
            await this.bitrixService.appendDealComment(state.visitDealId, `Пациент пришел на визит. Dentist Plus visitId=${input.visitId}`);
        }
        return {
            ok: true,
            patientId: input.patientId,
            visitId: input.visitId,
            bitrix: {
                contactId: state.contactId,
                requestDealId: state.requestDealId,
                visitDealId: state.visitDealId,
            },
            note: 'Пациент отмечен как пришедший.',
        };
    }
    async processPatientNoShow(input) {
        const state = await this.resolveBitrixState(input.patientId, input.visitId);
        if (state.requestDealId) {
            await this.bitrixService.updateDealStage(state.requestDealId, this.bitrixService.getStageIds().requests.stages.NO_SHOW);
            await this.bitrixService.appendDealComment(state.requestDealId, `Пациент не пришел. Dentist Plus visitId=${input.visitId}`);
        }
        if (state.visitDealId) {
            await this.bitrixService.appendDealComment(state.visitDealId, `Пациент не пришел. Dentist Plus visitId=${input.visitId}`);
            await this.bitrixService.updateDealStage(state.visitDealId, this.bitrixService.getStageIds().visits.stages.LOSE);
        }
        return {
            ok: true,
            patientId: input.patientId,
            visitId: input.visitId,
            bitrix: {
                contactId: state.contactId,
                requestDealId: state.requestDealId,
                visitDealId: state.visitDealId,
                movedRequestStageTo: this.bitrixService.getStageIds().requests.stages.NO_SHOW,
                movedVisitStageTo: this.bitrixService.getStageIds().visits.stages.LOSE,
            },
        };
    }
    async processVisitCancelled(input) {
        const reason = input.reason?.trim() || 'Пациент отменил запись';
        const currentVisit = await this.dentistService.getVisit(input.visitId);
        const cancelResult = await this.dentistService.cancelVisit({
            visitId: input.visitId,
            reason,
        });
        const doctorName = this.formatDoctorLabel(currentVisit.doctorId);
        const formattedDate = this.formatVisitDate(currentVisit.start);
        const formattedTime = this.formatVisitTimeRange(currentVisit.start, currentVisit.end);
        const state = await this.resolveBitrixState(input.patientId, input.visitId);
        const requestComment = [
            'Визит отменен',
            `Врач: ${doctorName}`,
            `Дата: ${formattedDate}`,
            `Время: ${formattedTime}`,
            `Причина: ${reason}`,
            `Dentist Plus visitId=${input.visitId}`,
        ].join('\n');
        const visitComment = [
            'Визит отменен в Dentist Plus',
            `Врач: ${doctorName}`,
            `Дата: ${formattedDate}`,
            `Время: ${formattedTime}`,
            `Причина: ${reason}`,
            `Dentist Plus visitId=${input.visitId}`,
        ].join('\n');
        if (state.requestDealId) {
            await this.bitrixService.updateDealStage(state.requestDealId, this.bitrixService.getStageIds().requests.stages.THINKING);
            await this.bitrixService.appendDealComment(state.requestDealId, requestComment);
        }
        if (state.visitDealId) {
            await this.bitrixService.appendDealComment(state.visitDealId, visitComment);
            await this.bitrixService.updateDealStage(state.visitDealId, this.bitrixService.getStageIds().visits.stages.LOSE);
        }
        return {
            ok: true,
            cancelResult,
            previousVisit: currentVisit,
            bitrix: {
                contactId: state.contactId,
                requestDealId: state.requestDealId,
                visitDealId: state.visitDealId,
                movedRequestStageTo: this.bitrixService.getStageIds().requests.stages.THINKING,
                movedVisitStageTo: this.bitrixService.getStageIds().visits.stages.LOSE,
            },
        };
    }
    async processVisitRescheduled(input) {
        const before = await this.dentistService.getVisit(input.visitId);
        const updatedVisit = await this.dentistService.updateVisit({
            visitId: input.visitId,
            patientId: input.patientId,
            doctorId: input.doctorId,
            branchId: input.branchId,
            start: input.start,
            end: input.end,
            description: input.description ?? before.description,
        });
        const oldDoctorName = this.formatDoctorLabel(before.doctorId);
        const newDoctorName = this.formatDoctorLabel(updatedVisit.doctorId);
        const oldDate = this.formatVisitDate(before.start);
        const oldTime = this.formatVisitTimeRange(before.start, before.end);
        const newDate = this.formatVisitDate(updatedVisit.start);
        const newTime = this.formatVisitTimeRange(updatedVisit.start, updatedVisit.end);
        const reasonLine = input.reason?.trim()
            ? `Причина: ${input.reason.trim()}`
            : null;
        const commentLines = [
            'Визит перенесен',
            `Было: ${oldDate} ${oldTime}`,
            `Стало: ${newDate} ${newTime}`,
            `Врач был: ${oldDoctorName}`,
            `Врач стал: ${newDoctorName}`,
            reasonLine,
            `Dentist Plus visitId=${input.visitId}`,
        ].filter(Boolean);
        const comment = commentLines.join('\n');
        const state = await this.resolveBitrixState(input.patientId, input.visitId);
        if (state.requestDealId) {
            await this.bitrixService.updateDealStage(state.requestDealId, this.bitrixService.getStageIds().requests.stages.BOOKED);
            await this.bitrixService.appendDealComment(state.requestDealId, comment);
        }
        if (state.visitDealId) {
            await this.bitrixService.appendDealComment(state.visitDealId, comment);
        }
        return {
            ok: true,
            before,
            visit: updatedVisit,
            bitrix: {
                contactId: state.contactId,
                requestDealId: state.requestDealId,
                visitDealId: state.visitDealId,
                keptRequestStageAt: this.bitrixService.getStageIds().requests.stages.BOOKED,
            },
            meta: {
                oldDoctorName,
                newDoctorName,
                oldDate,
                oldTime,
                newDate,
                newTime,
            },
        };
    }
    async processSendVisitReminder(input) {
        const visit = await this.dentistService.getVisit(input.visitId);
        const doctorName = this.formatDoctorLabel(visit.doctorId);
        const formattedDate = this.formatVisitDate(visit.start);
        const formattedTime = this.formatVisitTimeRange(visit.start, visit.end);
        const message = [
            'Здравствуйте!',
            `Напоминаем о вашем визите в клинику.`,
            `Дата: ${formattedDate}`,
            `Время: ${formattedTime}`,
            `Врач: ${doctorName}`,
            'Если нужно перенести или отменить запись, пожалуйста, ответьте на сообщение.',
        ].join('\n');
        const state = await this.resolveBitrixState(input.patientId, input.visitId);
        const comment = [
            'Сформировано напоминание о визите',
            `Дата: ${formattedDate}`,
            `Время: ${formattedTime}`,
            `Врач: ${doctorName}`,
            `Dentist Plus visitId=${input.visitId}`,
            input.phone ? `Телефон: ${input.phone}` : null,
        ]
            .filter(Boolean)
            .join('\n');
        if (state.requestDealId) {
            await this.bitrixService.appendDealComment(state.requestDealId, comment);
        }
        if (state.visitDealId) {
            await this.bitrixService.appendDealComment(state.visitDealId, comment);
        }
        return {
            ok: true,
            sent: false,
            reason: 'Текст напоминания сформирован. Реальная отправка будет подключена через WhatsApp-провайдера.',
            patientId: input.patientId,
            visitId: input.visitId,
            phone: input.phone ?? null,
            reminder: {
                doctorName,
                formattedDate,
                formattedTime,
                message,
            },
            bitrix: {
                contactId: state.contactId,
                requestDealId: state.requestDealId,
                visitDealId: state.visitDealId,
            },
        };
    }
    async processSyncKnownVisit(input) {
        const visitDeal = await this.bitrixService.findVisitDealByDentistPlusVisitId(input.visitId);
        if (!visitDeal?.ID) {
            return {
                ok: true,
                skip: true,
                reason: 'В Bitrix нет визитной сделки с таким Dentist Plus visitId. Чужой визит не импортируем.',
                visitId: input.visitId,
            };
        }
        let visit = null;
        let missingInDentist = false;
        try {
            visit = await this.dentistService.getVisit(input.visitId);
        }
        catch {
            missingInDentist = true;
        }
        if (missingInDentist || !visit) {
            if (!input.patientId) {
                throw new Error('Sync failed: patientId is required when visit is missing in Dentist Plus');
            }
            const state = await this.resolveBitrixState(input.patientId, input.visitId);
            const comment = [
                'Синхронизация известного визита',
                'Статус: визит не найден в Dentist Plus',
                'Предположительно визит был удален или отменен вручную',
                `Dentist Plus visitId=${input.visitId}`,
            ].join('\n');
            const requestStageChanged = await this.updateStageIfNeeded(state.requestDealId, state.requestDeal?.STAGE_ID, this.bitrixService.getStageIds().requests.stages.THINKING);
            const visitStageChanged = await this.updateStageIfNeeded(state.visitDealId, state.visitDeal?.STAGE_ID, this.bitrixService.getStageIds().visits.stages.LOSE);
            const requestCommentAdded = await this.appendCommentIfChanged(state.requestDealId, state.requestDeal?.COMMENTS, comment);
            const visitCommentAdded = await this.appendCommentIfChanged(state.visitDealId, state.visitDeal?.COMMENTS, comment);
            const changed = requestStageChanged ||
                visitStageChanged ||
                requestCommentAdded ||
                visitCommentAdded;
            return {
                ok: true,
                skip: false,
                changed,
                noChanges: !changed,
                visitId: input.visitId,
                missingInDentist: true,
                bitrix: {
                    contactId: state.contactId,
                    requestDealId: state.requestDealId,
                    visitDealId: state.visitDealId,
                    requestStage: this.bitrixService.getStageIds().requests.stages.THINKING,
                    visitStage: this.bitrixService.getStageIds().visits.stages.LOSE,
                    requestCommentAdded,
                    visitCommentAdded,
                },
            };
        }
        const resolvedPatientId = input.patientId ?? visit.patientId;
        if (!resolvedPatientId) {
            throw new Error('Sync failed: patientId is missing');
        }
        const state = await this.resolveBitrixState(resolvedPatientId, input.visitId);
        const doctorName = this.formatDoctorLabel(visit.doctorId);
        const formattedDate = this.formatVisitDate(visit.start);
        const formattedTime = this.formatVisitTimeRange(visit.start, visit.end);
        const cancelled = this.isCancelledStatus(visit.status);
        const normalizedStatus = this.normalizeStatusForKey(visit.status);
        const syncComment = cancelled
            ? [
                'Синхронизация известного визита',
                'Статус: визит отменен в Dentist Plus',
                `Врач: ${doctorName}`,
                `Дата: ${formattedDate}`,
                `Время: ${formattedTime}`,
                `Dentist Plus visitId=${input.visitId}`,
                `Sync state: cancelled|${input.visitId}|${visit.doctorId}|${visit.start}|${visit.end}|${normalizedStatus}`,
            ].join('\n')
            : [
                'Синхронизация известного визита',
                'Статус: визит актуален',
                `Врач: ${doctorName}`,
                `Дата: ${formattedDate}`,
                `Время: ${formattedTime}`,
                `Dentist Plus visitId=${input.visitId}`,
                `Sync state: active|${input.visitId}|${visit.doctorId}|${visit.start}|${visit.end}|${normalizedStatus}`,
            ].join('\n');
        const targetRequestStage = cancelled
            ? this.bitrixService.getStageIds().requests.stages.THINKING
            : this.bitrixService.getStageIds().requests.stages.BOOKED;
        const requestStageChanged = await this.updateStageIfNeeded(state.requestDealId, state.requestDeal?.STAGE_ID, targetRequestStage);
        const requestCommentAdded = await this.appendCommentIfChanged(state.requestDealId, state.requestDeal?.COMMENTS, syncComment);
        let visitStageChanged = false;
        if (cancelled) {
            visitStageChanged = await this.updateStageIfNeeded(state.visitDealId, state.visitDeal?.STAGE_ID, this.bitrixService.getStageIds().visits.stages.LOSE);
        }
        const visitCommentAdded = await this.appendCommentIfChanged(state.visitDealId, state.visitDeal?.COMMENTS, syncComment);
        const changed = requestStageChanged ||
            requestCommentAdded ||
            visitStageChanged ||
            visitCommentAdded;
        return {
            ok: true,
            skip: false,
            changed,
            noChanges: !changed,
            visit,
            bitrix: {
                contactId: state.contactId,
                requestDealId: state.requestDealId,
                visitDealId: state.visitDealId,
                syncedKnownVisit: true,
                requestStage: targetRequestStage,
                visitStage: cancelled
                    ? this.bitrixService.getStageIds().visits.stages.LOSE
                    : state.visitDeal?.STAGE_ID ?? null,
                requestCommentAdded,
                visitCommentAdded,
            },
            meta: {
                cancelled,
                doctorName,
                formattedDate,
                formattedTime,
            },
        };
    }
};
exports.FlowService = FlowService;
exports.FlowService = FlowService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [dentist_service_1.DentistService,
        bitrix_service_1.BitrixService,
        patient_sync_service_1.PatientSyncService,
        doctors_directory_service_1.DoctorsDirectoryService])
], FlowService);
//# sourceMappingURL=flow.service.js.map