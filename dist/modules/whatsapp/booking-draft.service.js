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
var BookingDraftService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingDraftService = void 0;
const common_1 = require("@nestjs/common");
const bitrix_service_1 = require("../integrations/bitrix/bitrix.service");
const dentist_service_1 = require("../integrations/dentist/dentist.service");
const prisma_service_1 = require("../../prisma/prisma.service");
let BookingDraftService = BookingDraftService_1 = class BookingDraftService {
    constructor(prisma, dentistService, bitrixService) {
        this.prisma = prisma;
        this.dentistService = dentistService;
        this.bitrixService = bitrixService;
        this.logger = new common_1.Logger(BookingDraftService_1.name);
        this.draftExpiryMinutes = Number(process.env.BOOKING_DRAFT_EXPIRY_MINUTES || 90);
    }
    async getActiveDraft(session) {
        if (!this.prisma.connected || !session.id) {
            return null;
        }
        try {
            const draft = await this.prisma.bookingDraft.findFirst({
                where: {
                    chatSessionId: session.id,
                    status: {
                        in: ['COLLECTING', 'READY_FOR_OPERATOR', 'PAYMENT_PENDING', 'WAITING_RECEIPT', 'PAID'],
                    },
                },
                orderBy: { updatedAt: 'desc' },
            });
            return draft ? this.mapDraft(draft) : null;
        }
        catch (error) {
            this.logger.warn(`Failed to load active booking draft for ${session.normalizedPhone}`);
            this.logger.debug(error);
            return null;
        }
    }
    async ensureDraft(session, input) {
        if (!this.prisma.connected || !session.id) {
            return null;
        }
        const existing = await this.getActiveDraft(session);
        const payload = this.buildDraftPayload(session, input);
        try {
            const draft = existing
                ? await this.prisma.bookingDraft.update({
                    where: { id: existing.id },
                    data: payload,
                })
                : await this.prisma.bookingDraft.create({
                    data: {
                        chatSessionId: session.id,
                        ...payload,
                    },
                });
            return this.mapDraft(draft);
        }
        catch (error) {
            this.logger.warn(`Failed to ensure booking draft for ${session.normalizedPhone}`);
            this.logger.debug(error);
            return null;
        }
    }
    async updateDraftById(draftId, input) {
        if (!this.prisma.connected) {
            return null;
        }
        try {
            const draft = await this.prisma.bookingDraft.update({
                where: { id: draftId },
                data: this.buildRawUpdate(input),
            });
            return this.mapDraft(draft);
        }
        catch (error) {
            this.logger.warn(`Failed to update booking draft ${draftId}`);
            this.logger.debug(error);
            return null;
        }
    }
    async attachInvoice(draftId, input) {
        if (!this.prisma.connected) {
            return null;
        }
        try {
            return await this.prisma.paymentInvoice.create({
                data: {
                    bookingDraftId: draftId,
                    provider: input.provider,
                    invoiceUrl: input.invoiceUrl,
                    externalInvoiceId: input.externalInvoiceId,
                    amount: input.amount ?? undefined,
                    status: input.status || 'PENDING',
                    metadata: (input.metadata || {}),
                },
            });
        }
        catch (error) {
            this.logger.warn(`Failed to create payment invoice for draft ${draftId}`);
            this.logger.debug(error);
            return null;
        }
    }
    async markReceiptWaiting(draftId, input) {
        if (!this.prisma.connected) {
            return null;
        }
        try {
            const draft = await this.prisma.bookingDraft.update({
                where: { id: draftId },
                data: {
                    status: 'WAITING_RECEIPT',
                    paymentStatus: 'waiting_receipt',
                },
            });
            if (input?.receiptMessageId || input?.receiptFileReference) {
                await this.prisma.paymentInvoice.updateMany({
                    where: { bookingDraftId: draftId },
                    data: {
                        receiptMessageId: input.receiptMessageId || undefined,
                        receiptFileReference: input.receiptFileReference || undefined,
                        status: 'WAITING_CONFIRMATION',
                    },
                });
            }
            return this.mapDraft(draft);
        }
        catch (error) {
            this.logger.warn(`Failed to mark receipt waiting for draft ${draftId}`);
            this.logger.debug(error);
            return null;
        }
    }
    async finalizePaidBooking(draftId, input) {
        if (!this.prisma.connected) {
            return { draft: null, visit: null };
        }
        const draftRecord = await this.prisma.bookingDraft.findUnique({
            where: { id: draftId },
            include: { chatSession: true },
        });
        if (!draftRecord) {
            return { draft: null, visit: null };
        }
        if (!draftRecord.patientId || !draftRecord.selectedDoctorId || !draftRecord.selectedStart || !draftRecord.selectedEnd) {
            throw new Error('Booking draft is incomplete and cannot be finalized');
        }
        const slotDate = this.toIsoDate(draftRecord.selectedStart);
        const freshSlots = await this.dentistService.getAvailableSlots({
            doctorId: draftRecord.selectedDoctorId,
            branchId: Number(process.env.DEFAULT_BRANCH_ID || 5061),
            dateFrom: slotDate,
            dateTo: slotDate,
            slotMinutes: this.diffMinutes(draftRecord.selectedStart, draftRecord.selectedEnd),
        });
        const slotStillAvailable = freshSlots.some((day) => day.slots.some((slot) => slot.start === this.toDentistDateTime(draftRecord.selectedStart) &&
            slot.end === this.toDentistDateTime(draftRecord.selectedEnd)));
        if (!slotStillAvailable) {
            const expired = await this.prisma.bookingDraft.update({
                where: { id: draftId },
                data: {
                    status: 'EXPIRED',
                    finalizationError: 'Selected slot is no longer available',
                },
            });
            return { draft: this.mapDraft(expired), visit: null };
        }
        const visit = await this.dentistService.createVisit({
            branchId: Number(process.env.DEFAULT_BRANCH_ID || 5061),
            patientId: draftRecord.patientId,
            doctorId: draftRecord.selectedDoctorId,
            start: this.toDentistDateTime(draftRecord.selectedStart),
            end: this.toDentistDateTime(draftRecord.selectedEnd),
            description: `Booking draft ${draftRecord.id}${input?.note ? `. ${input.note}` : ''}`,
        });
        const bitrix = await this.bitrixService.ensureVisitDealAndMoveRequest({
            patientId: draftRecord.patientId,
            doctorId: draftRecord.selectedDoctorId,
            branchId: Number(process.env.DEFAULT_BRANCH_ID || 5061),
            start: this.toDentistDateTime(draftRecord.selectedStart),
            end: this.toDentistDateTime(draftRecord.selectedEnd),
            dentistPlusVisitId: visit.id,
            visitComment: `Finalized paid booking draft ${draftRecord.id}`,
            amount: draftRecord.price ?? undefined,
        });
        const updated = await this.prisma.bookingDraft.update({
            where: { id: draftId },
            data: {
                status: 'CONFIRMED',
                dentistVisitId: visit.id,
                visitDealId: bitrix.visitDealId,
                requestDealId: bitrix.requestDealId ?? draftRecord.requestDealId,
                paymentProvider: input?.paymentProvider || draftRecord.paymentProvider,
                paymentStatus: 'confirmed',
                paymentConfirmedAt: new Date(),
                finalizationError: null,
                rawCollectedData: {
                    ...(this.parseJson(draftRecord.rawCollectedData) || {}),
                    finalizedBy: input?.confirmedBy || 'manual_confirmation',
                },
            },
        });
        if (draftRecord.requestDealId) {
            await this.bitrixService.appendDealComment(draftRecord.requestDealId, `Оплата подтверждена. Создан Dentist Plus visitId=${visit.id}.`);
        }
        return {
            draft: this.mapDraft(updated),
            visit,
        };
    }
    buildDraftPayload(session, input) {
        const rawCollectedData = {
            patientName: session.patientName,
            selectedService: input?.service ?? session.selectedService,
            selectedCleaningType: input?.cleaningType ?? session.selectedCleaningType,
            selectedPrice: input?.price ?? session.selectedPrice,
            selectedDateText: session.selectedDateOnly,
            selectedDateTimeText: session.selectedDateTimeText,
            childDataText: session.childDataText,
            previousVisitAnswer: session.previousVisitAnswer,
            metadata: session.metadata,
            ...(input?.rawCollectedData || {}),
        };
        return {
            patientId: input?.patientId ?? session.patientId ?? undefined,
            bitrixContactId: input?.bitrixContactId ?? undefined,
            requestDealId: input?.requestDealId ?? session.leadId ?? undefined,
            selectedService: input?.service ?? session.selectedService ?? undefined,
            selectedCleaningType: input?.cleaningType ?? session.selectedCleaningType ?? undefined,
            selectedDoctorId: input?.doctorId ?? undefined,
            selectedDate: input?.date ? new Date(`${input.date}T00:00:00.000Z`) : undefined,
            selectedStart: input?.start ? new Date(input.start.replace(' ', 'T')) : undefined,
            selectedEnd: input?.end ? new Date(input.end.replace(' ', 'T')) : undefined,
            price: input?.price ?? session.selectedPrice ?? undefined,
            status: input?.status || 'COLLECTING',
            expiresAt: input?.expiresAt ?? new Date(Date.now() + this.draftExpiryMinutes * 60 * 1000),
            rawCollectedData: rawCollectedData,
        };
    }
    buildRawUpdate(input) {
        return {
            patientId: typeof input.patientId === 'number' ? input.patientId : undefined,
            bitrixContactId: typeof input.bitrixContactId === 'number' ? input.bitrixContactId : undefined,
            requestDealId: typeof input.requestDealId === 'number' ? input.requestDealId : undefined,
            selectedService: input.service ?? undefined,
            selectedCleaningType: input.cleaningType ?? undefined,
            selectedDoctorId: typeof input.doctorId === 'number' ? input.doctorId : undefined,
            selectedDate: input.date ? new Date(`${input.date}T00:00:00.000Z`) : undefined,
            selectedStart: input.start ? new Date(input.start.replace(' ', 'T')) : undefined,
            selectedEnd: input.end ? new Date(input.end.replace(' ', 'T')) : undefined,
            price: typeof input.price === 'number' ? input.price : undefined,
            status: input.status ?? undefined,
            expiresAt: input.expiresAt === null ? null : input.expiresAt ?? undefined,
            rawCollectedData: input.rawCollectedData ? input.rawCollectedData : undefined,
        };
    }
    mapDraft(draft) {
        return {
            id: draft.id,
            chatSessionId: draft.chatSessionId,
            patientId: draft.patientId,
            bitrixContactId: draft.bitrixContactId,
            requestDealId: draft.requestDealId,
            visitDealId: draft.visitDealId,
            selectedService: draft.selectedService || null,
            selectedCleaningType: draft.selectedCleaningType || null,
            selectedDoctorId: draft.selectedDoctorId,
            selectedDate: draft.selectedDate?.toISOString() || null,
            selectedStart: draft.selectedStart ? this.toDentistDateTime(draft.selectedStart) : null,
            selectedEnd: draft.selectedEnd ? this.toDentistDateTime(draft.selectedEnd) : null,
            price: draft.price,
            status: draft.status,
            dentistVisitId: draft.dentistVisitId,
            paymentProvider: draft.paymentProvider,
            paymentStatus: draft.paymentStatus,
            paymentConfirmedAt: draft.paymentConfirmedAt?.toISOString() || null,
            expiresAt: draft.expiresAt?.toISOString() || null,
            rawCollectedData: this.parseJson(draft.rawCollectedData) || {},
            finalizationError: draft.finalizationError,
        };
    }
    parseJson(value) {
        if (!value || typeof value !== 'object') {
            return null;
        }
        return value;
    }
    toDentistDateTime(value) {
        const date = typeof value === 'string' ? new Date(value.replace(' ', 'T')) : value;
        const pad = (num) => String(num).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }
    toIsoDate(value) {
        const pad = (num) => String(num).padStart(2, '0');
        return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
    }
    diffMinutes(start, end) {
        return Math.max(30, Math.round((end.getTime() - start.getTime()) / 60000));
    }
};
exports.BookingDraftService = BookingDraftService;
exports.BookingDraftService = BookingDraftService = BookingDraftService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        dentist_service_1.DentistService,
        bitrix_service_1.BitrixService])
], BookingDraftService);
//# sourceMappingURL=booking-draft.service.js.map