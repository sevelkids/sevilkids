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
var WhatsAppSessionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppSessionService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let WhatsAppSessionService = WhatsAppSessionService_1 = class WhatsAppSessionService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(WhatsAppSessionService_1.name);
        this.sessions = new Map();
    }
    async get(phone, options) {
        const normalizedPhone = this.normalizePhone(phone);
        const cached = this.sessions.get(normalizedPhone);
        if (cached) {
            if (options?.whatsappChatId && !cached.whatsappChatId) {
                cached.whatsappChatId = options.whatsappChatId;
            }
            if (options?.externalChatId && !cached.externalChatId) {
                cached.externalChatId = options.externalChatId;
            }
            return cached;
        }
        if (!this.prisma.connected) {
            const fresh = this.createEmptySession(normalizedPhone, phone, options);
            this.sessions.set(normalizedPhone, fresh);
            return fresh;
        }
        try {
            const record = await this.prisma.chatSession.findUnique({
                where: { normalizedPhone },
            });
            const session = record
                ? this.mapRecordToSession(record)
                : this.createEmptySession(normalizedPhone, phone, options);
            if (options?.whatsappChatId && !session.whatsappChatId) {
                session.whatsappChatId = options.whatsappChatId;
            }
            if (options?.externalChatId && !session.externalChatId) {
                session.externalChatId = options.externalChatId;
            }
            this.sessions.set(normalizedPhone, session);
            return session;
        }
        catch (error) {
            this.logger.warn(`Failed to load session ${normalizedPhone} from DB, using memory cache`);
            this.logger.debug(error);
            const fresh = this.createEmptySession(normalizedPhone, phone, options);
            this.sessions.set(normalizedPhone, fresh);
            return fresh;
        }
    }
    async save(session) {
        const normalizedPhone = this.normalizePhone(session.phoneNumber || session.normalizedPhone);
        session.normalizedPhone = normalizedPhone;
        session.phoneNumber = session.phoneNumber || normalizedPhone;
        this.sessions.set(normalizedPhone, session);
        if (!this.prisma.connected) {
            return session;
        }
        const payload = this.mapSessionToRecord(session);
        try {
            const record = await this.prisma.chatSession.upsert({
                where: { normalizedPhone },
                create: payload,
                update: payload,
            });
            const mapped = this.mapRecordToSession(record);
            this.sessions.set(normalizedPhone, mapped);
            return mapped;
        }
        catch (error) {
            this.logger.warn(`Failed to persist session ${normalizedPhone}`);
            this.logger.debug(error);
            return session;
        }
    }
    async listTrackedSessions() {
        const memorySessions = Array.from(this.sessions.values());
        if (!this.prisma.connected) {
            return memorySessions;
        }
        try {
            const records = await this.prisma.chatSession.findMany({
                orderBy: { updatedAt: 'desc' },
                take: 200,
            });
            for (const record of records) {
                const mapped = this.mapRecordToSession(record);
                this.sessions.set(mapped.normalizedPhone, mapped);
            }
        }
        catch (error) {
            this.logger.warn('Failed to list tracked chat sessions from DB');
            this.logger.debug(error);
        }
        return Array.from(this.sessions.values());
    }
    async findById(id) {
        const cached = Array.from(this.sessions.values()).find((session) => session.id === id);
        if (cached) {
            return cached;
        }
        if (!this.prisma.connected) {
            return null;
        }
        try {
            const record = await this.prisma.chatSession.findUnique({ where: { id } });
            if (!record) {
                return null;
            }
            const mapped = this.mapRecordToSession(record);
            this.sessions.set(mapped.normalizedPhone, mapped);
            return mapped;
        }
        catch (error) {
            this.logger.warn(`Failed to load session ${id}`);
            this.logger.debug(error);
            return null;
        }
    }
    async updateMode(session, input) {
        session.currentMode = input.currentMode;
        const resolvedAllowBotReplies = typeof input.allowBotReplies === 'boolean'
            ? input.allowBotReplies
            : input.currentMode === 'AUTO';
        session.allowBotReplies = resolvedAllowBotReplies;
        session.botEnabled = input.currentMode === 'AUTO';
        if (typeof input.assignedOperatorId !== 'undefined') {
            session.assignedOperatorId = input.assignedOperatorId;
        }
        if (typeof input.handoffReason !== 'undefined') {
            session.handoffReason = input.handoffReason;
        }
        if (input.currentStep) {
            session.currentStep = input.currentStep;
        }
        if (input.currentMode === 'WAITING_OPERATOR' || input.currentMode === 'HUMAN') {
            session.handoffRequestedAt = session.handoffRequestedAt || new Date().toISOString();
        }
        if (input.markHumanTaken) {
            session.humanTakenAt = new Date().toISOString();
        }
        return this.save(session);
    }
    reset(phone) {
        const normalizedPhone = this.normalizePhone(phone);
        const fresh = this.createEmptySession(normalizedPhone, phone);
        this.sessions.set(normalizedPhone, fresh);
        return fresh;
    }
    clear(phone) {
        this.sessions.delete(this.normalizePhone(phone));
    }
    resetPendingSteps(session) {
        session.awaitingConsultationAge = false;
        session.awaitingCleaningType = false;
        session.awaitingDateTime = false;
        session.awaitingTimeChoice = false;
        session.awaitingBookingConfirmation = false;
        session.awaitingPreviousVisit = false;
        session.awaitingChildData = false;
        session.awaitingReceipt = false;
        return session;
    }
    resetSelection(session) {
        session.selectedService = null;
        session.selectedCleaningType = null;
        session.selectedPrice = null;
        session.selectedDateTimeText = null;
        session.selectedDateOnly = null;
        session.availableTimeOptions = [];
        return session;
    }
    markThinking(session) {
        session.leadStage = 'thinking';
        session.followupSentAt = new Date().toISOString();
        return session;
    }
    markClosedWithoutBooking(session) {
        session.leadStage = 'closed_without_booking';
        session.closedAt = new Date().toISOString();
        session.currentStep = 'CLOSED';
        return session;
    }
    markBooked(session, input) {
        session.leadStage = 'booked';
        session.activeAppointmentId = input.appointmentId;
        session.activeAppointmentDateTime = input.appointmentDateTime;
        session.activeAppointmentDoctorId = input.doctorId;
        session.activeAppointmentDoctorName = input.doctorName;
        session.activeAppointmentStatus = 'booked';
        session.currentStep = 'BOOKING_CONFIRMED';
        this.resetPendingSteps(session);
        this.resetSelection(session);
        return session;
    }
    normalizePhone(phone) {
        const digits = (phone || '').replace(/\D/g, '');
        if (!digits) {
            return phone;
        }
        if (digits.length === 11 && digits.startsWith('8')) {
            return `7${digits.slice(1)}`;
        }
        if (digits.length === 10) {
            return `7${digits}`;
        }
        return digits;
    }
    createEmptyState() {
        return {
            language: 'ru',
            greeted: false,
            patientChecked: false,
            patientFound: false,
            patientId: null,
            patientName: null,
            leadId: null,
            leadStage: null,
            leadCreatedAt: null,
            followupSentAt: null,
            lastClientMessageAt: null,
            closedAt: null,
            activeAppointmentId: null,
            activeAppointmentDateTime: null,
            activeAppointmentDoctorId: null,
            activeAppointmentDoctorName: null,
            activeAppointmentStatus: null,
            awaitingName: false,
            creatingPatient: false,
            awaitingConsultationAge: false,
            awaitingCleaningType: false,
            awaitingDateTime: false,
            awaitingTimeChoice: false,
            awaitingBookingConfirmation: false,
            awaitingPreviousVisit: false,
            awaitingChildData: false,
            awaitingReceipt: false,
            selectedService: null,
            selectedCleaningType: null,
            selectedPrice: null,
            selectedDateTimeText: null,
            selectedDateOnly: null,
            childDataText: null,
            previousVisitAnswer: null,
            currentDraftId: null,
            availableTimeOptions: [],
        };
    }
    createEmptySession(normalizedPhone, phone, options) {
        return {
            id: null,
            phoneNumber: phone || normalizedPhone,
            normalizedPhone,
            whatsappChatId: options?.whatsappChatId || null,
            externalChatId: options?.externalChatId || null,
            currentMode: 'AUTO',
            currentStep: 'NEW',
            assignedOperatorId: null,
            bitrixLineId: null,
            bitrixChatId: null,
            bitrixDialogId: null,
            bitrixConnectorId: null,
            botEnabled: true,
            allowBotReplies: true,
            handoffRequestedAt: null,
            humanTakenAt: null,
            handoffReason: null,
            lastIncomingAt: null,
            lastOutgoingAt: null,
            metadata: {},
            ...this.createEmptyState(),
        };
    }
    mapRecordToSession(record) {
        const baseState = this.createEmptyState();
        const dbState = this.parseJsonRecord(record.state);
        const metadata = this.parseJsonRecord(record.metadata) || {};
        return {
            ...baseState,
            ...dbState,
            id: record.id,
            phoneNumber: record.phone,
            normalizedPhone: record.normalizedPhone,
            whatsappChatId: record.whatsappChatId,
            externalChatId: record.externalChatId,
            currentMode: record.currentMode,
            currentStep: record.currentStep || 'NEW',
            assignedOperatorId: record.assignedOperatorId,
            bitrixLineId: record.bitrixLineId,
            bitrixChatId: record.bitrixChatId,
            bitrixDialogId: record.bitrixDialogId,
            bitrixConnectorId: record.bitrixConnectorId,
            botEnabled: record.botEnabled,
            allowBotReplies: record.allowBotReplies,
            handoffRequestedAt: record.handoffRequestedAt?.toISOString() || null,
            humanTakenAt: record.humanTakenAt?.toISOString() || null,
            handoffReason: record.handoffReason,
            lastIncomingAt: record.lastIncomingAt?.toISOString() || null,
            lastOutgoingAt: record.lastOutgoingAt?.toISOString() || null,
            metadata,
        };
    }
    mapSessionToRecord(session) {
        return {
            phone: session.phoneNumber,
            normalizedPhone: session.normalizedPhone,
            whatsappChatId: session.whatsappChatId,
            externalChatId: session.externalChatId,
            currentMode: session.currentMode,
            currentStep: session.currentStep,
            state: this.buildStatePayload(session),
            assignedOperatorId: session.assignedOperatorId,
            bitrixLineId: session.bitrixLineId,
            bitrixChatId: session.bitrixChatId,
            bitrixDialogId: session.bitrixDialogId,
            bitrixConnectorId: session.bitrixConnectorId,
            botEnabled: session.botEnabled,
            allowBotReplies: session.allowBotReplies,
            handoffRequestedAt: session.handoffRequestedAt ? new Date(session.handoffRequestedAt) : null,
            humanTakenAt: session.humanTakenAt ? new Date(session.humanTakenAt) : null,
            handoffReason: session.handoffReason,
            lastIncomingAt: session.lastIncomingAt ? new Date(session.lastIncomingAt) : null,
            lastOutgoingAt: session.lastOutgoingAt ? new Date(session.lastOutgoingAt) : null,
            metadata: (session.metadata || {}),
        };
    }
    buildStatePayload(session) {
        return {
            language: session.language,
            greeted: session.greeted,
            patientChecked: session.patientChecked,
            patientFound: session.patientFound,
            patientId: session.patientId,
            patientName: session.patientName,
            leadId: session.leadId,
            leadStage: session.leadStage,
            leadCreatedAt: session.leadCreatedAt,
            followupSentAt: session.followupSentAt,
            lastClientMessageAt: session.lastClientMessageAt,
            closedAt: session.closedAt,
            activeAppointmentId: session.activeAppointmentId,
            activeAppointmentDateTime: session.activeAppointmentDateTime,
            activeAppointmentDoctorId: session.activeAppointmentDoctorId,
            activeAppointmentDoctorName: session.activeAppointmentDoctorName,
            activeAppointmentStatus: session.activeAppointmentStatus,
            awaitingName: session.awaitingName,
            creatingPatient: session.creatingPatient,
            awaitingConsultationAge: session.awaitingConsultationAge,
            awaitingCleaningType: session.awaitingCleaningType,
            awaitingDateTime: session.awaitingDateTime,
            awaitingTimeChoice: session.awaitingTimeChoice,
            awaitingBookingConfirmation: session.awaitingBookingConfirmation,
            awaitingPreviousVisit: session.awaitingPreviousVisit,
            awaitingChildData: session.awaitingChildData,
            awaitingReceipt: session.awaitingReceipt,
            selectedService: session.selectedService,
            selectedCleaningType: session.selectedCleaningType,
            selectedPrice: session.selectedPrice,
            selectedDateTimeText: session.selectedDateTimeText,
            selectedDateOnly: session.selectedDateOnly,
            childDataText: session.childDataText,
            previousVisitAnswer: session.previousVisitAnswer,
            currentDraftId: session.currentDraftId,
            availableTimeOptions: session.availableTimeOptions,
        };
    }
    parseJsonRecord(value) {
        if (!value || typeof value !== 'object') {
            return null;
        }
        return value;
    }
};
exports.WhatsAppSessionService = WhatsAppSessionService;
exports.WhatsAppSessionService = WhatsAppSessionService = WhatsAppSessionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], WhatsAppSessionService);
//# sourceMappingURL=whatsapp.session.js.map