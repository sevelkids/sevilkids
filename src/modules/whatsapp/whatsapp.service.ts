import { Injectable, Logger } from '@nestjs/common';
import { DentistService } from '../integrations/dentist/dentist.service';
import { BitrixService } from '../integrations/bitrix/bitrix.service';
import { BitrixOpenLinesService } from '../integrations/bitrix/bitrix-openlines.service';
import { DOCTORS_DATA } from '../doctors/doctors.data';
import { WhatsAppSessionService } from './whatsapp.session';
import { WhatsAppMessagesService } from './whatsapp.messages';
import { BookingDraftService } from './booking-draft.service';
import { WhatsAppScriptCatalog } from './whatsapp.script-catalog';
import {
    AvailableTimeOption,
    ChatSession,
    CleaningType,
    HandleIncomingResult,
    Language,
    ParsedIntent,
    SupportedService,
    WhatsAppInboundMessage,
} from './whatsapp.types';
import { GeminiNluService } from '../nlu/gemini-nlu.service';

type ResolvedDateTime = {
    date: string;
    hasExplicitTime: boolean;
    requestedHour: number | null;
    requestedMinute: number | null;
    rawText: string;
};

@Injectable()
export class WhatsAppService {
    private readonly logger = new Logger(WhatsAppService.name);
    private readonly defaultBranchId = 5061;

    constructor(
        private readonly dentistService: DentistService,
        private readonly bitrixService: BitrixService,
        private readonly bitrixOpenLinesService: BitrixOpenLinesService,
        private readonly sessionService: WhatsAppSessionService,
        private readonly messages: WhatsAppMessagesService,
        private readonly bookingDraftService: BookingDraftService,
        private readonly scriptCatalog: WhatsAppScriptCatalog,
        private readonly geminiNluService: GeminiNluService,
    ) {}

    async handleIncoming(input: WhatsAppInboundMessage): Promise<HandleIncomingResult> {
        const session = await this.sessionService.get(input.phoneNumber, {
            whatsappChatId: input.whatsappChatId || input.from,
            externalChatId: input.externalChatId || input.from,
        });
        const text = input.text.trim();
        const lower = text.toLowerCase();

        session.lastClientMessageAt = new Date().toISOString();
        session.lastIncomingAt = session.lastClientMessageAt;
        session.whatsappChatId = input.whatsappChatId || input.from || session.whatsappChatId;
        session.externalChatId = input.externalChatId || input.from || session.externalChatId;

        this.logger.log(`Incoming from ${input.phoneNumber}: ${text}`);
        this.logger.debug(`Session before: ${JSON.stringify(session)}`);

        try {
            await this.bitrixOpenLinesService.forwardClientMessage(session, {
                text,
                phoneNumber: input.phoneNumber,
                whatsappMessageId: input.messageId,
                payload: input.payload,
            });

            if (this.requestsHuman(lower)) {
                this.logger.log(
                    `Handoff requested by client for ${session.normalizedPhone}; switching mode to WAITING_OPERATOR`,
                );
                await this.moveSessionToHuman(session, {
                    reason: 'client_requested_human',
                    operatorId: null,
                });

                return {
                    reply: null,
                    session,
                    suppressReply: true,
                };
            }

            if (session.currentMode !== 'AUTO') {
                this.logger.log(
                    `Reply suppressed for ${session.normalizedPhone}: currentMode=${session.currentMode}, allowBotReplies=${session.allowBotReplies}, botEnabled=${session.botEnabled}`,
                );
                return {
                    reply: null,
                    session,
                    suppressReply: true,
                };
            }

        if (this.shouldSendOpeningGreeting(session)) {
            session.greeted = true;

            return {
                reply: this.messages.getMainGreeting(session.language, session.patientName),
                session,
            };
        }

        if (session.awaitingName) {
            const created = await this.createPatientAndLead(input, session, text);

            return {
                reply: this.messages.getPostRegistrationPrompt(session.language, created.displayName || text),
                session,
            };
        }

        if (this.isCancelPhrase(lower)) {
            this.sessionService.resetPendingSteps(session);
            this.sessionService.resetSelection(session);

            return {
                reply: this.messages.t(
                    session.language,
                    'Хорошо. Тогда напишите, пожалуйста, что вас сейчас интересует: консультация или чистка.',
                    'Жақсы. Онда сізді қазір не қызықтыратынын жаза аласыз ба: консультация ма, әлде тіс тазалау ма?',
                ),
                session,
            };
        }

        await this.ensurePatient(input, session);

        const activeAppointmentReply = await this.tryHandleActiveAppointment(session, text);
        if (activeAppointmentReply) {
            return {
                reply: activeAppointmentReply,
                session,
            };
        }

        await this.ensureLead(input, session);

        if (session.awaitingPreviousVisit) {
            session.previousVisitAnswer = text;
            session.awaitingPreviousVisit = false;
            session.awaitingConsultationAge = true;
            session.currentStep = 'ASK_PATIENT_AGE';

            return {
                reply: this.scriptCatalog.getPatientAgeQuestion(),
                session,
            };
        }

        if (session.awaitingChildData) {
            session.childDataText = text;
            session.awaitingChildData = false;
            session.awaitingDateTime = true;
            session.currentStep = 'ASK_DATE';

            await this.bookingDraftService.ensureDraft(session, {
                service: session.selectedService,
                cleaningType: session.selectedCleaningType,
                price: session.selectedPrice,
                rawCollectedData: {
                    childDataText: text,
                },
            });

            return {
                reply: this.messages.t(
                    session.language,
                    'Спасибо. Теперь подскажите удобную дату или время для записи.',
                    'Рақмет. Енді өзіңізге ыңғайлы күнді немесе уақытты жаза аласыз ба?',
                ),
                session,
            };
        }

        if (session.awaitingReceipt && session.currentDraftId) {
            await this.bookingDraftService.markReceiptWaiting(session.currentDraftId, {
                receiptMessageId: input.messageId,
            });
            session.awaitingReceipt = false;
            session.currentStep = 'WAITING_RECEIPT';

            return {
                reply: null,
                session,
                suppressReply: true,
            };
        }

        if (session.awaitingConsultationAge) {
            if (this.looksLikeCleaning(text)) {
                this.sessionService.resetPendingSteps(session);
                session.selectedService = 'cleaning';

                const type = this.detectCleaningType(text);
                if (type) {
                    session.selectedCleaningType = type;
                    session.selectedPrice = this.getCleaningTypePrice(type);
                    session.awaitingDateTime = true;

                    await this.updateLeadContext(session, {
                        title: `Заявка: ${session.patientName || input.phoneNumber} — ${this.getCleaningTypeLabel(session.language, type)}`,
                        amount: session.selectedPrice,
                        comment: `Выбран вариант чистки: ${this.getCleaningTypeLabel(session.language, type)}`,
                    });

                    return {
                        reply:
                            `${this.messages.t(
                                session.language,
                                `Хорошо, выбрана ${this.getCleaningTypeLabel(session.language, type)}. Стоимость — ${session.selectedPrice} тг.`,
                                `${this.getCleaningTypeLabel(session.language, type)} таңдалды. Құны — ${session.selectedPrice} тг.`,
                            )}\n` +
                            this.messages.t(
                                session.language,
                                'Подскажите, пожалуйста, удобную дату или время.',
                                'Өзіңізге ыңғайлы күнді немесе уақытты жаза аласыз ба?',
                            ),
                        session,
                    };
                }

                session.awaitingCleaningType = true;

                await this.updateLeadContext(session, {
                    title: `Заявка: ${session.patientName || input.phoneNumber} — чистка`,
                    comment: 'Клиент переключился с консультации на чистку',
                });

                return {
                    reply: this.messages.getCleaningTypePrompt(session.language),
                    session,
                };
            }

            const age = this.extractAge(text);
            if (age === null) {
                return {
                    reply: this.messages.getConsultationAgePrompt(session.language),
                    session,
                };
            }

            session.awaitingConsultationAge = false;
            session.selectedService = 'consultation';
            session.selectedPrice = age < 16 ? 8000 : 10000;
            session.currentStep = 'ASK_DATE';

            await this.updateLeadContext(session, {
                title: `Заявка: ${session.patientName || input.phoneNumber} — консультация`,
                amount: session.selectedPrice,
                comment: `Уточнен возраст пациента: ${age}. Стоимость консультации: ${session.selectedPrice} тг`,
            });

            return {
                reply:
                    `${this.messages.getConsultationPrice(session.language, age)}\n` +
                    this.messages.t(
                        session.language,
                        'Если хотите, я сразу помогу записаться на консультацию.',
                        'Қаласаңыз, мен бірден консультацияға жазылуға көмектесемін.',
                    ),
                session,
            };
        }

        if (session.awaitingCleaningType) {
            const type = this.detectCleaningType(text);
            if (!type) {
                return {
                    reply: this.messages.getCleaningTypePrompt(session.language),
                    session,
                };
            }

            session.awaitingCleaningType = false;
            session.selectedCleaningType = type;
            session.selectedService = 'cleaning';
            session.selectedPrice = this.getCleaningTypePrice(type);
            session.awaitingDateTime = true;

            await this.updateLeadContext(session, {
                title: `Заявка: ${session.patientName || input.phoneNumber} — ${this.getCleaningTypeLabel(session.language, type)}`,
                amount: session.selectedPrice,
                comment: `Выбран вариант чистки: ${this.getCleaningTypeLabel(session.language, type)}`,
            });

            return {
                reply:
                    `${this.messages.t(
                        session.language,
                        `Хорошо, выбрана ${this.getCleaningTypeLabel(session.language, type)}. Стоимость — ${session.selectedPrice} тг.`,
                        `${this.getCleaningTypeLabel(session.language, type)} таңдалды. Құны — ${session.selectedPrice} тг.`,
                    )}\n` +
                    this.messages.t(
                        session.language,
                        'Подскажите, пожалуйста, удобную дату или время.',
                        'Өзіңізге ыңғайлы күнді немесе уақытты жаза аласыз ба?',
                    ),
                session,
            };
        }

        if (session.awaitingTimeChoice) {
            const picked = this.pickTimeOption(session.availableTimeOptions, text);

            if (!picked) {
                return {
                    reply: this.formatTimeOptionsReply(session.language, session.selectedDateOnly, session.availableTimeOptions),
                    session,
                };
            }

            const booked = await this.bookSelectedSlot(session, picked, text);

            return {
                reply: this.getBookingCompletionReply(session, booked),
                session,
            };
        }

        const intent = await this.geminiNluService.parseIntent(text, session.language);
        session.language = intent.language || session.language;

        if (intent.intent === 'greeting') {
            if (!session.greeted) {
                session.greeted = true;
                return {
                    reply: this.messages.getMainGreeting(session.language, session.patientName),
                    session,
                };
            }

            return {
                reply: this.messages.getServicesText(session.language),
                session,
            };
        }

        if (intent.intent === 'ask_services') {
            return {
                reply: this.messages.getServicesText(session.language),
                session,
            };
        }

        if (this.isSedationIntent(text)) {
            session.selectedService = 'sedation';
            session.currentStep = 'READY_FOR_OPERATOR';
            await this.moveSessionToHuman(session, {
                reason: 'sedation_requires_consultation',
                operatorId: null,
            });

            return {
                reply: `${this.scriptCatalog.getSedationInfo()}\n\n${this.scriptCatalog.getConsultationCallToAction()}`,
                session,
            };
        }

        if (this.isAllergyTestIntent(text)) {
            session.selectedService = 'allergy_test';
            session.currentStep = 'READY_FOR_OPERATOR';
            await this.moveSessionToHuman(session, {
                reason: 'allergy_test_operator_followup',
                operatorId: null,
            });

            return {
                reply: this.scriptCatalog.getAllergyTestInfo(),
                session,
            };
        }

        if (this.isOnlineConsultationIntent(text)) {
            session.selectedService = 'online_consultation';
            session.currentStep = 'PAYMENT_PENDING';
            await this.moveSessionToHuman(session, {
                reason: 'online_consultation_payment',
                operatorId: null,
            });

            return {
                reply: this.scriptCatalog.getOnlineConsultationInfo(),
                session,
            };
        }

        if (
            (intent.intent === 'ask_price' || intent.intent === 'choose_service' || intent.intent === 'booking_request') &&
            intent.service === 'consultation'
        ) {
            this.sessionService.resetPendingSteps(session);
            session.selectedCleaningType = null;
            session.selectedService = 'consultation';

            if (intent.intent === 'ask_price') {
                if (intent.age === null) {
                    session.awaitingPreviousVisit = true;
                    session.currentStep = 'ASK_PREVIOUS_VISIT';

                    await this.updateLeadContext(session, {
                        title: `Заявка: ${session.patientName || input.phoneNumber} — консультация`,
                        comment: 'Клиент запросил информацию по консультации',
                    });

                    return {
                        reply: `${this.scriptCatalog.getConsultationPrepayment()}\n\n${this.scriptCatalog.getPreviousVisitQuestion()}`,
                        session,
                    };
                }

                session.selectedPrice = intent.age < 16 ? 8000 : 10000;

                await this.updateLeadContext(session, {
                    title: `Заявка: ${session.patientName || input.phoneNumber} — консультация`,
                    amount: session.selectedPrice,
                    comment: `Клиент запросил цену консультации. Возраст: ${intent.age}`,
                });

                return {
                    reply: this.scriptCatalog.getConsultationPrepayment(),
                    session,
                };
            }

            session.awaitingDateTime = true;
            session.currentStep = 'ASK_DATE';

            await this.updateLeadContext(session, {
                title: `Заявка: ${session.patientName || input.phoneNumber} — консультация`,
                amount: session.selectedPrice ?? undefined,
                comment: 'Клиент выбрал услугу: консультация',
            });

            return {
                reply: this.messages.getAskDateTime(
                    session.language,
                    this.messages.t(session.language, 'консультацию', 'консультацияға'),
                ),
                session,
            };
        }

        if (
            (intent.intent === 'ask_price' || intent.intent === 'choose_service' || intent.intent === 'booking_request') &&
            intent.service === 'cleaning'
        ) {
            this.sessionService.resetPendingSteps(session);
            session.selectedService = 'cleaning';

            if (intent.intent === 'ask_price') {
                await this.updateLeadContext(session, {
                    title: `Заявка: ${session.patientName || input.phoneNumber} — чистка`,
                    comment: 'Клиент запросил информацию по чистке',
                });

                return {
                    reply: this.scriptCatalog.getCleaningCost(),
                    session,
                };
            }

            if (intent.cleaning_type) {
                session.selectedCleaningType = intent.cleaning_type;
                session.selectedPrice = this.getCleaningTypePrice(intent.cleaning_type);
                session.awaitingDateTime = true;

                await this.updateLeadContext(session, {
                    title: `Заявка: ${session.patientName || input.phoneNumber} — ${this.getCleaningTypeLabel(session.language, intent.cleaning_type)}`,
                    amount: session.selectedPrice,
                    comment: `Выбран вариант чистки: ${this.getCleaningTypeLabel(session.language, intent.cleaning_type)}`,
                });

                return {
                    reply:
                        `${this.messages.t(
                            session.language,
                            `Хорошо, выбрана ${this.getCleaningTypeLabel(session.language, intent.cleaning_type)}. Стоимость — ${session.selectedPrice} тг.`,
                            `${this.getCleaningTypeLabel(session.language, intent.cleaning_type)} таңдалды. Құны — ${session.selectedPrice} тг.`,
                        )}\n` +
                        this.messages.t(
                            session.language,
                            'Подскажите, пожалуйста, удобную дату или время.',
                            'Өзіңізге ыңғайлы күнді немесе уақытты жаза аласыз ба?',
                        ),
                    session,
                };
            }

            session.awaitingCleaningType = true;
            session.currentStep = 'ASK_CLEANING_TYPE';

            await this.updateLeadContext(session, {
                title: `Заявка: ${session.patientName || input.phoneNumber} — чистка`,
                comment: 'Клиент выбрал услугу: чистка',
            });

            return {
                reply: this.messages.getCleaningTypePrompt(session.language),
                session,
            };
        }

        if (intent.intent === 'provide_datetime' || session.awaitingDateTime) {
            if (!session.selectedService) {
                return {
                    reply: this.messages.getServicesText(session.language),
                    session,
                };
            }

            const resolved = this.resolveDateTime(intent.datetime_text || text);
            if (!resolved) {
                return {
                    reply: this.messages.t(
                        session.language,
                        'Подскажите, пожалуйста, удобную дату или время, чтобы я проверила свободные окна.',
                        'Бос уақыттарды тексеру үшін ыңғайлы күнді немесе уақытты жаза аласыз ба?',
                    ),
                    session,
                };
            }

            if (!resolved.hasExplicitTime) {
                const options = await this.findAvailableTimeOptions(session, resolved);

                if (!options.length) {
                    return {
                        reply: this.messages.getNoSlotReply(session.language),
                        session,
                    };
                }

                session.awaitingDateTime = false;
                session.awaitingTimeChoice = true;
                session.selectedDateOnly = resolved.date;
                session.availableTimeOptions = options;

                await this.updateLeadContext(session, {
                    comment: `Клиент выбрал дату без времени: ${this.formatDateLabel(resolved.date)}. Показаны свободные слоты.`,
                });

                return {
                    reply: this.formatTimeOptionsReply(session.language, resolved.date, options),
                    session,
                };
            }

            const matched = await this.findClosestSlotForExactTime(session, resolved);

            if (!matched) {
                const fallbackOptions = await this.findAvailableTimeOptions(session, resolved);

                if (!fallbackOptions.length) {
                    return {
                        reply: this.messages.getNoSlotReply(session.language),
                        session,
                    };
                }

                session.awaitingDateTime = false;
                session.awaitingTimeChoice = true;
                session.selectedDateOnly = resolved.date;
                session.availableTimeOptions = fallbackOptions;

                await this.updateLeadContext(session, {
                    comment: `На точное время ${intent.datetime_text || text} слот не найден. Показаны ближайшие доступные варианты.`,
                });

                return {
                    reply: this.formatTimeOptionsReply(session.language, resolved.date, fallbackOptions),
                    session,
                };
            }

            const booked = await this.bookSelectedSlot(session, matched, text);

            return {
                reply: this.getBookingCompletionReply(session, booked),
                session,
            };
        }

        return {
            reply: this.messages.getServicesText(session.language),
            session,
        };
        } finally {
            await this.sessionService.save(session);
        }
    }

    private async ensurePatient(input: WhatsAppInboundMessage, session: ChatSession): Promise<void> {
        if (session.patientChecked && session.patientFound) {
            return;
        }

        const patient = await this.dentistService.findPatientByPhone(input.phoneNumber);

        if (!patient) {
            session.patientChecked = true;
            session.patientFound = false;
            session.patientId = null;
            session.patientName = null;
            session.awaitingName = true;

            if (!session.greeted) {
                session.greeted = true;
                throw new WhatsAppReplyError(this.messages.getNotFoundAskName(session.language));
            }

            throw new WhatsAppReplyError(this.messages.getAskNameAgain(session.language));
        }

        session.patientChecked = true;
        session.patientFound = true;
        session.patientId = patient.id;
        session.patientName = this.extractDisplayName({
            fullName: patient.fullName,
            firstName: patient.firstName,
            lastName: patient.lastName,
            middleName: patient.middleName,
        });
    }

    private async ensureLead(input: WhatsAppInboundMessage, session: ChatSession): Promise<void> {
        if (session.leadId) {
            return;
        }

        const leadId = await this.createFreshRequestLead({
            phone: input.phoneNumber,
            firstName: session.patientName || undefined,
            patientName: session.patientName || undefined,
            message: input.text,
            dentistPlusPatientId: session.patientId || undefined,
        });

        session.leadId = leadId;
        session.leadStage = 'new';
        session.leadCreatedAt = new Date().toISOString();
    }

    private async createPatientAndLead(
        input: WhatsAppInboundMessage,
        session: ChatSession,
        firstName: string,
    ): Promise<{ displayName: string | null }> {
        const patient = await this.dentistService.createPatient({
            firstName,
            lastName: 'Пациент',
            phone: input.phoneNumber,
            branchId: this.defaultBranchId,
        });

        const displayName = this.extractDisplayName({
            fullName: patient.fullName,
            firstName: patient.firstName,
            lastName: patient.lastName,
            middleName: patient.middleName,
        });

        session.awaitingName = false;
        session.patientChecked = true;
        session.patientFound = true;
        session.patientId = patient.id;
        session.patientName = displayName;
        session.greeted = true;

        if (!session.leadId) {
            const leadId = await this.createFreshRequestLead({
                phone: input.phoneNumber,
                firstName: patient.firstName || undefined,
                patientName: displayName || undefined,
                message: input.text,
                dentistPlusPatientId: patient.id,
            });

            session.leadId = leadId;
            session.leadStage = 'new';
            session.leadCreatedAt = new Date().toISOString();
        }

        return { displayName };
    }

    private async createFreshRequestLead(input: {
        phone: string;
        firstName?: string;
        patientName?: string;
        message: string;
        dentistPlusPatientId?: number;
    }): Promise<number> {
        let contact =
            input.dentistPlusPatientId
                ? await this.bitrixService.findContactByDentistPlusPatientId(input.dentistPlusPatientId)
                : null;

        if (!contact) {
            contact = await this.bitrixService.findContactByPhone(input.phone);
        }

        let contactId: number;

        if (!contact?.ID) {
            contactId = await this.bitrixService.createContact({
                firstName: input.firstName,
                lastName: '',
                fullName: input.patientName,
                phone: input.phone,
                dentistPlusPatientId: input.dentistPlusPatientId,
            });
        } else {
            contactId = Number(contact.ID);
            await this.bitrixService.updateContact(contactId, {
                firstName: input.firstName,
                fullName: input.patientName,
                phone: input.phone,
                dentistPlusPatientId: input.dentistPlusPatientId,
            });
        }

        return this.bitrixService.createRequestDeal({
            contactId,
            phone: input.phone,
            patientName: input.patientName,
            message: input.message,
            dentistPlusPatientId: input.dentistPlusPatientId,
        });
    }

    private async tryHandleActiveAppointment(
        session: ChatSession,
        text: string,
    ): Promise<string | null> {
        if (!session.patientId) {
            return null;
        }

        const now = new Date();
        const dateFrom = this.formatIsoDate(now);
        const dateTo = this.formatIsoDate(new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000));

        const visits = await this.dentistService.getVisits({
            patientId: session.patientId,
            branchId: this.defaultBranchId,
            dateFrom,
            dateTo,
        });

        const futureVisit = visits
            .filter((visit) => new Date(visit.start.replace(' ', 'T')).getTime() > now.getTime())
            .sort((a, b) => a.start.localeCompare(b.start))[0];

        if (!futureVisit) {
            return null;
        }

        session.activeAppointmentId = futureVisit.id;
        session.activeAppointmentDateTime = futureVisit.start;
        session.activeAppointmentDoctorId = futureVisit.doctorId;
        session.activeAppointmentDoctorName = this.getDoctorNameById(futureVisit.doctorId);
        session.activeAppointmentStatus = 'booked';
        session.leadStage = 'booked';

        const lower = text.toLowerCase();

        if (
            lower.includes('привет') ||
            lower.includes('здравств') ||
            lower.includes('сәлем') ||
            lower.includes('во сколько') ||
            lower.includes('когда') ||
            lower.includes('на когда') ||
            lower.includes('запис')
        ) {
            return this.messages.t(
                session.language,
                `${session.patientName || 'Здравствуйте'}! У вас уже есть запись.
Дата и время: ${this.formatDateTimeLabel(futureVisit.start)}
Врач: ${this.getDoctorNameById(futureVisit.doctorId)}

Если нужно, я могу помочь с переносом или отменой записи.`,
                `${session.patientName || 'Сәлеметсіз бе'}! Сізде белсенді жазылу бар.
Күні мен уақыты: ${this.formatDateTimeLabel(futureVisit.start)}
Дәрігер: ${this.getDoctorNameById(futureVisit.doctorId)}

Қаласаңыз, мен ауыстыруға немесе бас тартуға көмектесе аламын.`,
            );
        }

        return null;
    }

    private async findAvailableTimeOptions(
        session: ChatSession,
        resolved: ResolvedDateTime,
    ): Promise<AvailableTimeOption[]> {
        if (!session.selectedService) {
            return [];
        }

        const candidates = DOCTORS_DATA.filter((doctor) => doctor.services[session.selectedService!]);
        const options: AvailableTimeOption[] = [];

        for (const doctor of candidates) {
            const slotMinutes = doctor.services[session.selectedService!]?.durationMinutes || 30;

            const availableDays = await this.dentistService.getAvailableSlots({
                doctorId: doctor.doctorId,
                branchId: this.defaultBranchId,
                dateFrom: resolved.date,
                dateTo: resolved.date,
                slotMinutes,
            });

            for (const day of availableDays) {
                for (const slot of day.slots) {
                    options.push({
                        start: slot.start,
                        end: slot.end,
                        label: this.extractTimeLabel(slot.start),
                        doctorId: doctor.doctorId,
                        doctorName: doctor.fullName,
                    });
                }
            }
        }

        const now = new Date();
        const filteredOptions = options.filter((option) => {
            const slotStart = new Date(option.start.replace(' ', 'T'));
            return slotStart.getTime() > now.getTime();
        });

        const uniqueByTime = new Map<string, AvailableTimeOption>();
        for (const option of filteredOptions.sort((a, b) => a.start.localeCompare(b.start))) {
            if (!uniqueByTime.has(option.label)) {
                uniqueByTime.set(option.label, option);
            }
        }

        return Array.from(uniqueByTime.values()).slice(0, 5);
    }

    private async findClosestSlotForExactTime(
        session: ChatSession,
        resolved: ResolvedDateTime,
    ): Promise<AvailableTimeOption | null> {
        if (!session.selectedService) {
            return null;
        }

        const candidates = DOCTORS_DATA.filter((doctor) => doctor.services[session.selectedService!]);

        for (const doctor of candidates) {
            const slotMinutes = doctor.services[session.selectedService!]?.durationMinutes || 30;

            const availableDays = await this.dentistService.getAvailableSlots({
                doctorId: doctor.doctorId,
                branchId: this.defaultBranchId,
                dateFrom: resolved.date,
                dateTo: resolved.date,
                slotMinutes,
            });

            for (const day of availableDays) {
                for (const slot of day.slots) {
                    const dt = new Date(slot.start.replace(' ', 'T'));
                    const now = new Date();

                    if (
                        dt.getHours() === resolved.requestedHour &&
                        dt.getMinutes() === (resolved.requestedMinute || 0) &&
                        dt.getTime() > now.getTime()
                    ) {
                        return {
                            start: slot.start,
                            end: slot.end,
                            label: this.extractTimeLabel(slot.start),
                            doctorId: doctor.doctorId,
                            doctorName: doctor.fullName,
                        };
                    }
                }
            }
        }

        return null;
    }

    private async bookSelectedSlot(
        session: ChatSession,
        selected: AvailableTimeOption,
        originalMessage: string,
    ): Promise<{
        visitId: number;
        doctorId: number;
        doctorName: string;
        startLabel: string;
    }> {
        if (!session.patientId) {
            throw new Error('Patient is missing before booking');
        }

        const requiresPrepayment = this.serviceRequiresPrepayment(session.selectedService);
        const forceDraftMode = String(process.env.BOOKING_DRAFT_FORCE_ALL || 'false').toLowerCase() === 'true';

        if (requiresPrepayment || forceDraftMode) {
            const draft = await this.bookingDraftService.ensureDraft(session, {
                service: session.selectedService,
                cleaningType: session.selectedCleaningType,
                doctorId: selected.doctorId,
                date: selected.start.slice(0, 10),
                start: selected.start,
                end: selected.end,
                price: session.selectedPrice,
                patientId: session.patientId,
                requestDealId: session.leadId,
                status: requiresPrepayment ? 'PAYMENT_PENDING' : 'READY_FOR_OPERATOR',
                rawCollectedData: {
                    source: 'whatsapp_bot',
                    originalMessage,
                    selectedDoctorName: selected.doctorName,
                },
            });

            session.currentDraftId = draft?.id || null;
            session.awaitingReceipt = requiresPrepayment;
            session.currentStep = requiresPrepayment ? 'PAYMENT_PENDING' : 'READY_FOR_OPERATOR';

            await this.moveSessionToHuman(session, {
                reason: requiresPrepayment ? 'payment_pending' : 'operator_completion',
                operatorId: null,
            });

            await this.updateLeadContext(session, {
                title: `Заявка: ${session.patientName || 'Пациент'} — ожидает подтверждения`,
                amount: session.selectedPrice ?? undefined,
                comment: `Подготовлен booking draft.
Услуга: ${this.getCurrentServiceLabel(session)}
Дата и время: ${this.formatDateTimeLabel(selected.start)}
Врач: ${selected.doctorName}
Статус: ${requiresPrepayment ? 'ожидание оплаты' : 'ожидание оператора'}`,
            });

            return {
                visitId: 0,
                doctorId: selected.doctorId,
                doctorName: selected.doctorName,
                startLabel: this.formatDateTimeLabel(selected.start),
            };
        }

        const visit = await this.dentistService.createVisit({
            branchId: this.defaultBranchId,
            patientId: session.patientId,
            doctorId: selected.doctorId,
            start: selected.start,
            end: selected.end,
            description: `WhatsApp: ${originalMessage}`,
        });

        await this.bitrixService.ensureVisitDealAndMoveRequest({
            patientId: session.patientId,
            doctorId: selected.doctorId,
            branchId: this.defaultBranchId,
            start: selected.start,
            end: selected.end,
            dentistPlusVisitId: visit.id,
            visitComment: `WhatsApp booking: ${this.getCurrentServiceLabel(session)}`,
            amount: session.selectedPrice ?? undefined,
        });

        await this.updateLeadContext(session, {
            title: `Заявка: ${session.patientName || 'Пациент'} — записан`,
            amount: session.selectedPrice ?? undefined,
            comment: `Создан визит.
Услуга: ${this.getCurrentServiceLabel(session)}
Дата и время: ${this.formatDateTimeLabel(selected.start)}
Врач: ${selected.doctorName}`,
        });

        this.sessionService.markBooked(session, {
            appointmentId: visit.id,
            appointmentDateTime: selected.start,
            doctorId: selected.doctorId,
            doctorName: selected.doctorName,
        });

        return {
            visitId: visit.id,
            doctorId: selected.doctorId,
            doctorName: selected.doctorName,
            startLabel: this.formatDateTimeLabel(selected.start),
        };
    }

    private async updateLeadContext(
        session: ChatSession,
        input: {
            title?: string;
            amount?: number | undefined;
            comment?: string;
        },
    ): Promise<void> {
        if (!session.leadId) return;

        const fields: Record<string, unknown> = {};

        if (input.title) {
            fields.TITLE = input.title;
        }

        if (typeof input.amount === 'number') {
            fields.OPPORTUNITY = input.amount;
        }

        if (Object.keys(fields).length) {
            await (this.bitrixService as any).call('crm.deal.update', {
                id: session.leadId,
                fields,
            });
        }

        if (input.comment) {
            await this.bitrixService.appendDealComment(session.leadId, input.comment);
        }
    }

    private formatTimeOptionsReply(
        lang: Language,
        date: string | null,
        options: AvailableTimeOption[],
    ): string {
        const formattedDate = date ? this.formatDateLabel(date) : '';

        const header = this.messages.t(
            lang,
            `На ${formattedDate} есть свободное время:`,
            `${formattedDate} күні бос уақыттар бар:`,
        );

        const times = options.map((option) => `• ${option.label}`).join('\n');

        const footer = this.messages.t(
            lang,
            'Напишите, пожалуйста, какое время вам удобно.',
            'Өзіңізге ыңғайлы уақытты жаза аласыз ба?',
        );

        return `${header}\n${times}\n\n${footer}`;
    }

    private pickTimeOption(options: AvailableTimeOption[], text: string): AvailableTimeOption | null {
        const normalized = text.trim().toLowerCase();

        const direct = options.find((option) => option.label.toLowerCase() === normalized);
        if (direct) return direct;

        const match = normalized.match(/\b(\d{1,2})(?::(\d{2}))?\b/);
        if (!match) return null;

        const hour = Number(match[1]);
        const minute = match[2] ? Number(match[2]) : 0;
        const target = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

        return options.find((option) => option.label === target) || null;
    }

    private parseDateOnly(text: string): string | null {
        const lower = text.toLowerCase();
        const now = new Date();

        const base = new Date(now);

        if (lower.includes('завтра') || lower.includes('ертең')) {
            base.setDate(base.getDate() + 1);
            return this.formatIsoDate(base);
        }

        if (lower.includes('послезавтра')) {
            base.setDate(base.getDate() + 2);
            return this.formatIsoDate(base);
        }

        const weekdayMap: Record<string, number> = {
            воскресенье: 0,
            понедельник: 1,
            вторник: 2,
            среда: 3,
            четверг: 4,
            пятница: 5,
            суббота: 6,
        };

        for (const [word, targetWeekday] of Object.entries(weekdayMap)) {
            if (lower.includes(word)) {
                const currentWeekday = now.getDay();
                let delta = targetWeekday - currentWeekday;

                if (lower.includes('эта ') || lower.includes('эту ')) {
                    if (delta < 0) delta += 7;
                } else if (lower.includes('следующ')) {
                    if (delta <= 0) delta += 7;
                    delta += 7;
                } else {
                    if (delta < 0) delta += 7;
                }

                const dt = new Date(now);
                dt.setDate(now.getDate() + delta);
                return this.formatIsoDate(dt);
            }
        }

        const m = lower.match(/\b(\d{1,2})\s*(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)/);
        if (!m) return null;

        const day = Number(m[1]);
        const monthText = m[2];

        const monthMap: Record<string, number> = {
            январ: 0,
            феврал: 1,
            март: 2,
            апрел: 3,
            май: 4,
            мая: 4,
            июн: 5,
            июл: 6,
            август: 7,
            сентябр: 8,
            октябр: 9,
            ноябр: 10,
            декабр: 11,
        };

        const month = monthMap[monthText];
        if (month === undefined) return null;

        const year = now.getFullYear();
        const dt = new Date(year, month, day);

        return this.formatIsoDate(dt);
    }

    private resolveDateTime(text: string): ResolvedDateTime | null {
        const lower = text.toLowerCase();
        const date = this.parseDateOnly(text);

        const match = lower.match(/\b(\d{1,2})(?::(\d{2}))?\b/);

        if (!date && !match) {
            return null;
        }

        let hour: number | null = null;
        let minute: number | null = null;

        if (match) {
            hour = Number(match[1]);
            minute = match[2] ? Number(match[2]) : 0;

            if ((lower.includes('вечер') || lower.includes('вечера')) && hour < 12) {
                hour += 12;
            }
        }

        return {
            date: date || this.formatIsoDate(new Date()),
            hasExplicitTime: Boolean(match),
            requestedHour: hour,
            requestedMinute: minute,
            rawText: text,
        };
    }

    private formatDateTimeLabel(value: string): string {
        const [datePart, timePart] = value.split(' ');
        if (!datePart || !timePart) return value;

        const [y, m, d] = datePart.split('-');
        return `${d}.${m}.${y} ${timePart.slice(0, 5)}`;
    }

    private formatDateLabel(value: string): string {
        const [y, m, d] = value.split('-');
        return `${d}.${m}.${y}`;
    }

    private formatIsoDate(date: Date): string {
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    private extractTimeLabel(value: string): string {
        const [, time] = value.split(' ');
        return time ? time.slice(0, 5) : value;
    }

    private extractAge(text: string): number | null {
        const match = text.match(/\b(\d{1,2})\b/);
        if (!match) return null;
        const age = Number(match[1]);
        if (Number.isNaN(age) || age <= 0 || age > 99) return null;
        return age;
    }

    private detectCleaningType(text: string): ParsedIntent['cleaning_type'] {
        const lower = text.toLowerCase().trim();

        if (lower === '1' || lower.includes('лёгк') || lower.includes('легк') || lower.includes('жеңіл')) {
            return 'light_milk_bite';
        }

        if (lower === '2' || lower.includes('средн') || lower.includes('орташа')) {
            return 'medium_milk_bite';
        }

        if (
            lower === '3' ||
            ((lower.includes('air flow') || lower.includes('airflow')) &&
                (lower.includes('до 9') || lower.includes('9 лет')))
        ) {
            return 'airflow_glycine_upto9';
        }

        if (
            lower === '4' ||
            ((lower.includes('air flow') || lower.includes('airflow')) &&
                (lower.includes('10') || lower.includes('16')))
        ) {
            return 'airflow_glycine_10_16';
        }

        if (
            lower === '5' ||
            lower.includes('50к') ||
            lower.includes('50000') ||
            lower.includes('50 000') ||
            lower.includes('prophylaxis') ||
            lower.includes('профилактичес')
        ) {
            return 'prophylaxis_master';
        }

        return null;
    }

    private getCleaningTypeLabel(lang: Language, type: NonNullable<ParsedIntent['cleaning_type']>): string {
        const mapRu: Record<NonNullable<ParsedIntent['cleaning_type']>, string> = {
            light_milk_bite: 'лёгкая чистка (молочный прикус)',
            medium_milk_bite: 'средняя чистка (молочный прикус)',
            airflow_glycine_upto9: 'Air Flow с глицином (до 9 лет)',
            airflow_glycine_10_16: 'Air Flow с глицином (10–16 лет)',
            prophylaxis_master: 'Prophylaxis Master',
        };

        const mapKk: Record<NonNullable<ParsedIntent['cleaning_type']>, string> = {
            light_milk_bite: 'жеңіл тазалау (сүт тістемі)',
            medium_milk_bite: 'орташа тазалау (сүт тістемі)',
            airflow_glycine_upto9: 'Air Flow глицинмен (9 жасқа дейін)',
            airflow_glycine_10_16: 'Air Flow глицинмен (10–16 жас)',
            prophylaxis_master: 'Prophylaxis Master',
        };

        return lang === 'kk' ? mapKk[type] : mapRu[type];
    }

    private getCleaningTypePrice(type: NonNullable<ParsedIntent['cleaning_type']>): number {
        const prices: Record<NonNullable<ParsedIntent['cleaning_type']>, number> = {
            light_milk_bite: 10000,
            medium_milk_bite: 16000,
            airflow_glycine_upto9: 25000,
            airflow_glycine_10_16: 35000,
            prophylaxis_master: 50000,
        };

        return prices[type];
    }

    private getBookingCompletionReply(
        session: ChatSession,
        booked: {
            visitId: number;
            doctorId: number;
            doctorName: string;
            startLabel: string;
        },
    ): string {
        if (booked.visitId === 0) {
            if (this.serviceRequiresPrepayment(session.selectedService)) {
                return this.scriptCatalog.getConsultationPrepayment();
            }

            return this.messages.t(
                session.language,
                'Я передала запись оператору. Он продолжит оформление и свяжется с вами без потери контекста.',
                'Жазбаны операторға бердім. Ол әңгіменің контекстін жоғалтпай жалғастырады.',
            );
        }

        return this.messages.getBookedReply(session.language, {
            patientName: session.patientName,
            doctorName: booked.doctorName,
            dateTime: booked.startLabel,
        });
    }

    private serviceRequiresPrepayment(service: SupportedService | null): boolean {
        return service === 'consultation' || service === 'online_consultation';
    }

    private requestsHuman(lower: string): boolean {
        return [
            'оператор',
            'администратор',
            'человек',
            'с менеджером',
            'позовите человека',
            'живой',
            'human',
            'operator',
        ].some((phrase) => lower.includes(phrase));
    }

    private shouldSendOpeningGreeting(session: ChatSession): boolean {
        if (session.greeted) {
            return false;
        }

        if (session.currentStep !== 'NEW') {
            return false;
        }

        return ![
            session.awaitingName,
            session.creatingPatient,
            session.awaitingConsultationAge,
            session.awaitingCleaningType,
            session.awaitingDateTime,
            session.awaitingTimeChoice,
            session.awaitingBookingConfirmation,
            session.awaitingPreviousVisit,
            session.awaitingChildData,
            session.awaitingReceipt,
        ].some(Boolean);
    }

    private async moveSessionToHuman(
        session: ChatSession,
        input: {
            reason: string;
            operatorId: string | null;
        },
    ): Promise<void> {
        session.currentMode = input.operatorId ? 'HUMAN' : 'WAITING_OPERATOR';
        session.allowBotReplies = false;
        session.botEnabled = false;
        session.handoffReason = input.reason;
        session.handoffRequestedAt = session.handoffRequestedAt || new Date().toISOString();
        if (input.operatorId) {
            session.assignedOperatorId = input.operatorId;
            session.humanTakenAt = new Date().toISOString();
        }
    }

    private isSedationIntent(text: string): boolean {
        const lower = text.toLowerCase();
        return lower.includes('наркоз') || lower.includes('севоран') || lower.includes('sedation');
    }

    private isAllergyTestIntent(text: string): boolean {
        const lower = text.toLowerCase();
        return lower.includes('аллергопроб') || lower.includes('аллегопроб') || lower.includes('олимп');
    }

    private isOnlineConsultationIntent(text: string): boolean {
        const lower = text.toLowerCase();
        return lower.includes('онлайн') || lower.includes('аудио звонка') || lower.includes('online consultation');
    }

    private extractDisplayName(patient: {
        fullName?: string;
        firstName?: string;
        lastName?: string;
        middleName?: string;
    }): string | null {
        if (patient.lastName === 'Пациент' && patient.firstName) {
            return patient.firstName;
        }

        if (patient.firstName) {
            return patient.firstName;
        }

        if (patient.fullName) {
            const parts = patient.fullName.trim().split(/\s+/);
            if (parts.length >= 2 && parts[0] === 'Пациент') {
                return parts[1];
            }
            return parts[0] || patient.fullName;
        }

        return null;
    }

    private getCurrentServiceLabel(session: ChatSession): string {
        if (session.selectedService === 'consultation') {
            return 'консультация';
        }

        if (session.selectedService === 'cleaning' && session.selectedCleaningType) {
            return this.getCleaningTypeLabel('ru', session.selectedCleaningType);
        }

        if (session.selectedService === 'cleaning') {
            return 'чистка';
        }

        return 'услуга не указана';
    }

    private getDoctorNameById(doctorId?: number | null): string {
        if (!doctorId) return 'Врач не указан';
        return DOCTORS_DATA.find((item) => item.doctorId === doctorId)?.fullName || `Врач #${doctorId}`;
    }

    private looksLikeCleaning(text: string): boolean {
        const lower = text.toLowerCase();
        return (
            lower.includes('чист') ||
            lower.includes('чиста') ||
            lower.includes('тазала') ||
            lower.includes('air flow') ||
            lower.includes('airflow') ||
            lower.includes('prophylaxis') ||
            lower.includes('50к') ||
            lower.includes('50000')
        );
    }

    private isCancelPhrase(lower: string): boolean {
        return ['не надо', 'не нужно', 'неа', 'нет', 'жоқ', 'керек емес'].some((x) =>
            lower.includes(x),
        );
    }
}

class WhatsAppReplyError extends Error {
    constructor(public readonly reply: string) {
        super(reply);
    }
}
