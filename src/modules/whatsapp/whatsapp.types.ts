export type Language = 'ru' | 'kk';

export type ChatMode = 'AUTO' | 'HUMAN' | 'ASSIST' | 'WAITING_OPERATOR';

export type BookingDraftStatus =
    | 'COLLECTING'
    | 'READY_FOR_OPERATOR'
    | 'PAYMENT_PENDING'
    | 'WAITING_RECEIPT'
    | 'PAID'
    | 'CONFIRMED'
    | 'CANCELLED'
    | 'EXPIRED';

export type PaymentInvoiceStatus =
    | 'PENDING'
    | 'WAITING_CONFIRMATION'
    | 'PAID'
    | 'CANCELLED'
    | 'FAILED'
    | 'EXPIRED';

export type MessageDirection = 'IN' | 'OUT';

export type MessageSource = 'CLIENT' | 'BOT' | 'OPERATOR' | 'SYSTEM';

export type MessageDeliveryStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'SKIPPED';

export type SupportedService =
    | 'consultation'
    | 'cleaning'
    | 'sedation'
    | 'allergy_test'
    | 'online_consultation';

export type CleaningType =
    | 'light_milk_bite'
    | 'medium_milk_bite'
    | 'airflow_glycine_upto9'
    | 'airflow_glycine_10_16'
    | 'prophylaxis_master';

export type ConversationStep =
    | 'NEW'
    | 'ASK_SERVICE'
    | 'ASK_PREVIOUS_VISIT'
    | 'ASK_PATIENT_AGE'
    | 'ASK_CHILD_DATA'
    | 'ASK_CLEANING_TYPE'
    | 'ASK_DATE'
    | 'ASK_TIME'
    | 'READY_FOR_OPERATOR'
    | 'PAYMENT_PENDING'
    | 'WAITING_RECEIPT'
    | 'BOOKING_CONFIRMED'
    | 'HANDOFF_TO_OPERATOR'
    | 'CLOSED';

export type ParsedIntent = {
    language: Language;
    intent:
        | 'greeting'
        | 'ask_services'
        | 'ask_price'
        | 'choose_service'
        | 'booking_request'
        | 'provide_datetime'
        | 'choose_doctor'
        | 'cancel_request'
        | 'reschedule_request'
        | 'consultation'
        | 'cleaning'
        | 'sedation'
        | 'allergy_test'
        | 'online_consultation'
        | 'existing_patient_check'
        | 'collect_child_data'
        | 'payment_flow'
        | 'receipt_waiting'
        | 'appointment_confirmation'
        | 'request_human'
        | 'unknown';
    service: SupportedService | null;
    cleaning_type: CleaningType | null;
    age: number | null;
    datetime_text: string | null;
    doctor_preference: 'any' | 'specific' | null;
    needs_clarification: boolean;
    clarification_for: 'service' | 'datetime' | 'age' | 'cleaning_type' | null;
};

export type AvailableTimeOption = {
    start: string;
    end: string;
    label: string;
    doctorId: number;
    doctorName: string;
};

export type ChatSessionState = {
    language: Language;
    greeted: boolean;

    patientChecked: boolean;
    patientFound: boolean;
    patientId: number | null;
    patientName: string | null;

    leadId: number | null;
    leadStage: LeadStage | null;
    leadCreatedAt: string | null;
    followupSentAt: string | null;
    lastClientMessageAt: string | null;
    closedAt: string | null;

    activeAppointmentId: number | null;
    activeAppointmentDateTime: string | null;
    activeAppointmentDoctorId: number | null;
    activeAppointmentDoctorName: string | null;
    activeAppointmentStatus: 'booked' | 'cancelled' | 'done' | null;

    awaitingName: boolean;
    creatingPatient: boolean;

    awaitingConsultationAge: boolean;
    awaitingCleaningType: boolean;
    awaitingDateTime: boolean;
    awaitingTimeChoice: boolean;
    awaitingBookingConfirmation: boolean;
    awaitingPreviousVisit: boolean;
    awaitingChildData: boolean;
    awaitingReceipt: boolean;

    selectedService: SupportedService | null;
    selectedCleaningType: CleaningType | null;
    selectedPrice: number | null;
    selectedDateTimeText: string | null;
    selectedDateOnly: string | null;
    childDataText: string | null;
    previousVisitAnswer: string | null;
    currentDraftId: string | null;

    availableTimeOptions: AvailableTimeOption[];
};

export type LeadStage =
    | 'new'
    | 'in_progress'
    | 'thinking'
    | 'booked'
    | 'done'
    | 'cancelled'
    | 'no_show'
    | 'closed_without_booking';

export type ChatSession = ChatSessionState & {
    id: string | null;
    phoneNumber: string;
    normalizedPhone: string;
    whatsappChatId: string | null;
    externalChatId: string | null;
    currentMode: ChatMode;
    currentStep: ConversationStep;
    assignedOperatorId: string | null;
    bitrixLineId: string | null;
    bitrixChatId: string | null;
    bitrixDialogId: string | null;
    bitrixConnectorId: string | null;
    botEnabled: boolean;
    allowBotReplies: boolean;
    handoffRequestedAt: string | null;
    humanTakenAt: string | null;
    handoffReason: string | null;
    lastIncomingAt: string | null;
    lastOutgoingAt: string | null;
    metadata: Record<string, unknown>;
};

export type WhatsAppInboundMessage = {
    messageId: string;
    from: string;
    phoneNumber: string;
    text: string;
    whatsappChatId?: string | null;
    externalChatId?: string | null;
    payload?: Record<string, unknown>;
};

export type HandleIncomingResult = {
    reply: string | null;
    session: ChatSession;
    suppressReply?: boolean;
};

export type BookingDraftSnapshot = {
    id: string;
    chatSessionId: string;
    patientId: number | null;
    bitrixContactId: number | null;
    requestDealId: number | null;
    visitDealId: number | null;
    selectedService: SupportedService | null;
    selectedCleaningType: CleaningType | null;
    selectedDoctorId: number | null;
    selectedDate: string | null;
    selectedStart: string | null;
    selectedEnd: string | null;
    price: number | null;
    status: BookingDraftStatus;
    dentistVisitId: number | null;
    paymentProvider: string | null;
    paymentStatus: string | null;
    paymentConfirmedAt: string | null;
    expiresAt: string | null;
    rawCollectedData: Record<string, unknown>;
    finalizationError: string | null;
};

export type OutgoingMessageRequest = {
    session: ChatSession;
    text: string;
    source: Exclude<MessageSource, 'CLIENT'>;
    payload?: Record<string, unknown>;
    whatsappMessageId?: string | null;
    bitrixMessageId?: string | null;
};
