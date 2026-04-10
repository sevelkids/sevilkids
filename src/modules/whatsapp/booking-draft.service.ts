import { Injectable, Logger } from '@nestjs/common';
import { BitrixService } from '../integrations/bitrix/bitrix.service';
import { DentistService } from '../integrations/dentist/dentist.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
    BookingDraftSnapshot,
    BookingDraftStatus,
    ChatSession,
    CleaningType,
    SupportedService,
} from './whatsapp.types';

type DraftSelectionInput = {
    service?: SupportedService | null;
    cleaningType?: CleaningType | null;
    doctorId?: number | null;
    date?: string | null;
    start?: string | null;
    end?: string | null;
    price?: number | null;
    patientId?: number | null;
    bitrixContactId?: number | null;
    requestDealId?: number | null;
    rawCollectedData?: Record<string, unknown>;
    status?: BookingDraftStatus;
    expiresAt?: Date | null;
};

@Injectable()
export class BookingDraftService {
    private readonly logger = new Logger(BookingDraftService.name);
    private readonly draftExpiryMinutes = Number(process.env.BOOKING_DRAFT_EXPIRY_MINUTES || 90);

    constructor(
        private readonly prisma: PrismaService,
        private readonly dentistService: DentistService,
        private readonly bitrixService: BitrixService,
    ) {}

    async getActiveDraft(session: ChatSession): Promise<BookingDraftSnapshot | null> {
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
        } catch (error) {
            this.logger.warn(`Failed to load active booking draft for ${session.normalizedPhone}`);
            this.logger.debug(error);
            return null;
        }
    }

    async ensureDraft(session: ChatSession, input?: DraftSelectionInput): Promise<BookingDraftSnapshot | null> {
        if (!this.prisma.connected || !session.id) {
            return null;
        }

        const existing = await this.getActiveDraft(session);
        const payload = this.buildDraftPayload(session, input);

        try {
            const draft = existing
                ? await this.prisma.bookingDraft.update({
                      where: { id: existing.id },
                      data: payload as any,
                  })
                : await this.prisma.bookingDraft.create({
                      data: {
                          chatSessionId: session.id,
                          ...payload,
                      } as any,
                  });

            return this.mapDraft(draft);
        } catch (error) {
            this.logger.warn(`Failed to ensure booking draft for ${session.normalizedPhone}`);
            this.logger.debug(error);
            return null;
        }
    }

    async updateDraftById(draftId: string, input: DraftSelectionInput): Promise<BookingDraftSnapshot | null> {
        if (!this.prisma.connected) {
            return null;
        }

        try {
            const draft = await this.prisma.bookingDraft.update({
                where: { id: draftId },
                data: this.buildRawUpdate(input) as any,
            });
            return this.mapDraft(draft);
        } catch (error) {
            this.logger.warn(`Failed to update booking draft ${draftId}`);
            this.logger.debug(error);
            return null;
        }
    }

    async attachInvoice(
        draftId: string,
        input: {
            provider: string;
            invoiceUrl?: string | null;
            externalInvoiceId?: string | null;
            amount?: number | null;
            status?: 'PENDING' | 'WAITING_CONFIRMATION' | 'PAID' | 'CANCELLED' | 'FAILED' | 'EXPIRED';
            metadata?: Record<string, unknown>;
        },
    ) {
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
                    metadata: (input.metadata || {}) as any,
                },
            });
        } catch (error) {
            this.logger.warn(`Failed to create payment invoice for draft ${draftId}`);
            this.logger.debug(error);
            return null;
        }
    }

    async markReceiptWaiting(draftId: string, input?: { receiptMessageId?: string | null; receiptFileReference?: string | null }) {
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
        } catch (error) {
            this.logger.warn(`Failed to mark receipt waiting for draft ${draftId}`);
            this.logger.debug(error);
            return null;
        }
    }

    async finalizePaidBooking(
        draftId: string,
        input?: {
            confirmedBy?: string | null;
            paymentProvider?: string | null;
            note?: string | null;
        },
    ): Promise<{ draft: BookingDraftSnapshot | null; visit: any | null }> {
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

        const slotStillAvailable = freshSlots.some((day) =>
            day.slots.some(
                (slot) =>
                    slot.start === this.toDentistDateTime(draftRecord.selectedStart) &&
                    slot.end === this.toDentistDateTime(draftRecord.selectedEnd),
            ),
        );

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
                        ...(((this.parseJson(draftRecord.rawCollectedData) || {}) as Record<string, unknown>)),
                        finalizedBy: input?.confirmedBy || 'manual_confirmation',
                    } as any,
                },
            });

        if (draftRecord.requestDealId) {
            await this.bitrixService.appendDealComment(
                draftRecord.requestDealId,
                `Оплата подтверждена. Создан Dentist Plus visitId=${visit.id}.`,
            );
        }

        return {
            draft: this.mapDraft(updated),
            visit,
        };
    }

    private buildDraftPayload(session: ChatSession, input?: DraftSelectionInput) {
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
            rawCollectedData: rawCollectedData as any,
        };
    }

    private buildRawUpdate(input: DraftSelectionInput) {
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
            rawCollectedData: input.rawCollectedData ? (input.rawCollectedData as any) : undefined,
        };
    }

    private mapDraft(draft: {
        id: string;
        chatSessionId: string;
        patientId: number | null;
        bitrixContactId: number | null;
        requestDealId: number | null;
        visitDealId: number | null;
        selectedService: string | null;
        selectedCleaningType: string | null;
        selectedDoctorId: number | null;
        selectedDate: Date | null;
        selectedStart: Date | null;
        selectedEnd: Date | null;
        price: number | null;
        status: BookingDraftStatus;
        dentistVisitId: number | null;
        paymentProvider: string | null;
        paymentStatus: string | null;
        paymentConfirmedAt: Date | null;
        expiresAt: Date | null;
        rawCollectedData: unknown;
        finalizationError: string | null;
    }): BookingDraftSnapshot {
        return {
            id: draft.id,
            chatSessionId: draft.chatSessionId,
            patientId: draft.patientId,
            bitrixContactId: draft.bitrixContactId,
            requestDealId: draft.requestDealId,
            visitDealId: draft.visitDealId,
            selectedService: (draft.selectedService as SupportedService | null) || null,
            selectedCleaningType: (draft.selectedCleaningType as CleaningType | null) || null,
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
            rawCollectedData: this.parseJson<Record<string, unknown>>(draft.rawCollectedData) || {},
            finalizationError: draft.finalizationError,
        };
    }

    private parseJson<T>(value: unknown): T | null {
        if (!value || typeof value !== 'object') {
            return null;
        }
        return value as T;
    }

    private toDentistDateTime(value: Date): string;
    private toDentistDateTime(value: string): string;
    private toDentistDateTime(value: Date | string): string {
        const date = typeof value === 'string' ? new Date(value.replace(' ', 'T')) : value;
        const pad = (num: number) => String(num).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }

    private toIsoDate(value: Date): string {
        const pad = (num: number) => String(num).padStart(2, '0');
        return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
    }

    private diffMinutes(start: Date, end: Date): number {
        return Math.max(30, Math.round((end.getTime() - start.getTime()) / 60000));
    }
}
