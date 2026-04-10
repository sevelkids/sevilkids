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
var WhatsAppService_1;
var _a, _b, _c, _d, _e;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppService = void 0;
const common_1 = require("@nestjs/common");
const dentist_service_1 = require("../integrations/dentist/dentist.service");
const bitrix_service_1 = require("../integrations/bitrix/bitrix.service");
const doctors_data_1 = require("../doctors/doctors.data");
const whatsapp_session_1 = require("./whatsapp.session");
const whatsapp_messages_1 = require("./whatsapp.messages");
const gemini_nlu_service_1 = require("../nlu/gemini-nlu.service");
let WhatsAppService = WhatsAppService_1 = class WhatsAppService {
    constructor(dentistService, bitrixService, sessionService, messages, geminiNluService) {
        this.dentistService = dentistService;
        this.bitrixService = bitrixService;
        this.sessionService = sessionService;
        this.messages = messages;
        this.geminiNluService = geminiNluService;
        this.logger = new common_1.Logger(WhatsAppService_1.name);
        this.defaultBranchId = 5061;
    }
    async handleIncoming(input) {
        const session = this.sessionService.get(input.phoneNumber);
        const text = input.text.trim();
        const lower = text.toLowerCase();
        session.lastClientMessageAt = new Date().toISOString();
        this.logger.log(`Incoming from ${input.phoneNumber}: ${text}`);
        this.logger.debug(`Session before: ${JSON.stringify(session)}`);
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
                reply: this.messages.t(session.language, 'Хорошо. Тогда напишите, пожалуйста, что вас сейчас интересует: консультация или чистка.', 'Жақсы. Онда сізді қазір не қызықтыратынын жаза аласыз ба: консультация ма, әлде тіс тазалау ма?'),
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
                        reply: `${this.messages.t(session.language, `Хорошо, выбрана ${this.getCleaningTypeLabel(session.language, type)}. Стоимость — ${session.selectedPrice} тг.`, `${this.getCleaningTypeLabel(session.language, type)} таңдалды. Құны — ${session.selectedPrice} тг.`)}\n` +
                            this.messages.t(session.language, 'Подскажите, пожалуйста, удобную дату или время.', 'Өзіңізге ыңғайлы күнді немесе уақытты жаза аласыз ба?'),
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
            await this.updateLeadContext(session, {
                title: `Заявка: ${session.patientName || input.phoneNumber} — консультация`,
                amount: session.selectedPrice,
                comment: `Уточнен возраст пациента: ${age}. Стоимость консультации: ${session.selectedPrice} тг`,
            });
            return {
                reply: `${this.messages.getConsultationPrice(session.language, age)}\n` +
                    this.messages.t(session.language, 'Если хотите, я сразу помогу записаться на консультацию.', 'Қаласаңыз, мен бірден консультацияға жазылуға көмектесемін.'),
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
                reply: `${this.messages.t(session.language, `Хорошо, выбрана ${this.getCleaningTypeLabel(session.language, type)}. Стоимость — ${session.selectedPrice} тг.`, `${this.getCleaningTypeLabel(session.language, type)} таңдалды. Құны — ${session.selectedPrice} тг.`)}\n` +
                    this.messages.t(session.language, 'Подскажите, пожалуйста, удобную дату или время.', 'Өзіңізге ыңғайлы күнді немесе уақытты жаза аласыз ба?'),
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
                reply: this.messages.getBookedReply(session.language, {
                    patientName: session.patientName,
                    doctorName: booked.doctorName,
                    dateTime: booked.startLabel,
                }),
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
        if ((intent.intent === 'ask_price' || intent.intent === 'choose_service' || intent.intent === 'booking_request') &&
            intent.service === 'consultation') {
            this.sessionService.resetPendingSteps(session);
            session.selectedCleaningType = null;
            session.selectedService = 'consultation';
            if (intent.intent === 'ask_price') {
                if (intent.age === null) {
                    session.awaitingConsultationAge = true;
                    await this.updateLeadContext(session, {
                        title: `Заявка: ${session.patientName || input.phoneNumber} — консультация`,
                        comment: 'Клиент запросил информацию по консультации',
                    });
                    return {
                        reply: this.messages.getConsultationInfo(session.language),
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
                    reply: this.messages.getConsultationPrice(session.language, intent.age),
                    session,
                };
            }
            session.awaitingDateTime = true;
            await this.updateLeadContext(session, {
                title: `Заявка: ${session.patientName || input.phoneNumber} — консультация`,
                amount: session.selectedPrice ?? undefined,
                comment: 'Клиент выбрал услугу: консультация',
            });
            return {
                reply: this.messages.getAskDateTime(session.language, this.messages.t(session.language, 'консультацию', 'консультацияға')),
                session,
            };
        }
        if ((intent.intent === 'ask_price' || intent.intent === 'choose_service' || intent.intent === 'booking_request') &&
            intent.service === 'cleaning') {
            this.sessionService.resetPendingSteps(session);
            session.selectedService = 'cleaning';
            if (intent.intent === 'ask_price') {
                await this.updateLeadContext(session, {
                    title: `Заявка: ${session.patientName || input.phoneNumber} — чистка`,
                    comment: 'Клиент запросил информацию по чистке',
                });
                return {
                    reply: this.messages.getCleaningPriceList(session.language),
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
                    reply: `${this.messages.t(session.language, `Хорошо, выбрана ${this.getCleaningTypeLabel(session.language, intent.cleaning_type)}. Стоимость — ${session.selectedPrice} тг.`, `${this.getCleaningTypeLabel(session.language, intent.cleaning_type)} таңдалды. Құны — ${session.selectedPrice} тг.`)}\n` +
                        this.messages.t(session.language, 'Подскажите, пожалуйста, удобную дату или время.', 'Өзіңізге ыңғайлы күнді немесе уақытты жаза аласыз ба?'),
                    session,
                };
            }
            session.awaitingCleaningType = true;
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
                    reply: this.messages.t(session.language, 'Подскажите, пожалуйста, удобную дату или время, чтобы я проверила свободные окна.', 'Бос уақыттарды тексеру үшін ыңғайлы күнді немесе уақытты жаза аласыз ба?'),
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
                reply: this.messages.getBookedReply(session.language, {
                    patientName: session.patientName,
                    doctorName: booked.doctorName,
                    dateTime: booked.startLabel,
                }),
                session,
            };
        }
        return {
            reply: this.messages.getServicesText(session.language),
            session,
        };
    }
    async ensurePatient(input, session) {
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
    async ensureLead(input, session) {
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
    async createPatientAndLead(input, session, firstName) {
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
    async createFreshRequestLead(input) {
        let contact = input.dentistPlusPatientId
            ? await this.bitrixService.findContactByDentistPlusPatientId(input.dentistPlusPatientId)
            : null;
        if (!contact) {
            contact = await this.bitrixService.findContactByPhone(input.phone);
        }
        let contactId;
        if (!contact?.ID) {
            contactId = await this.bitrixService.createContact({
                firstName: input.firstName,
                lastName: '',
                fullName: input.patientName,
                phone: input.phone,
                dentistPlusPatientId: input.dentistPlusPatientId,
            });
        }
        else {
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
    async tryHandleActiveAppointment(session, text) {
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
        if (lower.includes('привет') ||
            lower.includes('здравств') ||
            lower.includes('сәлем') ||
            lower.includes('во сколько') ||
            lower.includes('когда') ||
            lower.includes('на когда') ||
            lower.includes('запис')) {
            return this.messages.t(session.language, `${session.patientName || 'Здравствуйте'}! У вас уже есть запись.
Дата и время: ${this.formatDateTimeLabel(futureVisit.start)}
Врач: ${this.getDoctorNameById(futureVisit.doctorId)}

Если нужно, я могу помочь с переносом или отменой записи.`, `${session.patientName || 'Сәлеметсіз бе'}! Сізде белсенді жазылу бар.
Күні мен уақыты: ${this.formatDateTimeLabel(futureVisit.start)}
Дәрігер: ${this.getDoctorNameById(futureVisit.doctorId)}

Қаласаңыз, мен ауыстыруға немесе бас тартуға көмектесе аламын.`);
        }
        return null;
    }
    async findAvailableTimeOptions(session, resolved) {
        if (!session.selectedService) {
            return [];
        }
        const candidates = doctors_data_1.DOCTORS_DATA.filter((doctor) => doctor.services[session.selectedService]);
        const options = [];
        for (const doctor of candidates) {
            const slotMinutes = doctor.services[session.selectedService]?.durationMinutes || 30;
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
        const uniqueByTime = new Map();
        for (const option of options.sort((a, b) => a.start.localeCompare(b.start))) {
            if (!uniqueByTime.has(option.label)) {
                uniqueByTime.set(option.label, option);
            }
        }
        return Array.from(uniqueByTime.values()).slice(0, 5);
    }
    async findClosestSlotForExactTime(session, resolved) {
        if (!session.selectedService) {
            return null;
        }
        const candidates = doctors_data_1.DOCTORS_DATA.filter((doctor) => doctor.services[session.selectedService]);
        for (const doctor of candidates) {
            const slotMinutes = doctor.services[session.selectedService]?.durationMinutes || 30;
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
                    if (dt.getHours() === resolved.requestedHour &&
                        dt.getMinutes() === (resolved.requestedMinute || 0)) {
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
    async bookSelectedSlot(session, selected, originalMessage) {
        if (!session.patientId) {
            throw new Error('Patient is missing before booking');
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
            visitComment: `WhatsApp booking: ${session.selectedService}`,
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
    async updateLeadContext(session, input) {
        if (!session.leadId)
            return;
        const fields = {};
        if (input.title) {
            fields.TITLE = input.title;
        }
        if (typeof input.amount === 'number') {
            fields.OPPORTUNITY = input.amount;
        }
        if (Object.keys(fields).length) {
            await this.bitrixService.call('crm.deal.update', {
                id: session.leadId,
                fields,
            });
        }
        if (input.comment) {
            await this.bitrixService.appendDealComment(session.leadId, input.comment);
        }
    }
    formatTimeOptionsReply(lang, date, options) {
        const formattedDate = date ? this.formatDateLabel(date) : '';
        const header = this.messages.t(lang, `На ${formattedDate} есть свободное время:`, `${formattedDate} күні бос уақыттар бар:`);
        const times = options.map((option) => `• ${option.label}`).join('\n');
        const footer = this.messages.t(lang, 'Напишите, пожалуйста, какое время вам удобно.', 'Өзіңізге ыңғайлы уақытты жаза аласыз ба?');
        return `${header}\n${times}\n\n${footer}`;
    }
    pickTimeOption(options, text) {
        const normalized = text.trim().toLowerCase();
        const direct = options.find((option) => option.label.toLowerCase() === normalized);
        if (direct)
            return direct;
        const match = normalized.match(/\b(\d{1,2})(?::(\d{2}))?\b/);
        if (!match)
            return null;
        const hour = Number(match[1]);
        const minute = match[2] ? Number(match[2]) : 0;
        const target = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        return options.find((option) => option.label === target) || null;
    }
    parseDateOnly(text) {
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
        const m = lower.match(/\b(\d{1,2})\s*(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)/);
        if (!m)
            return null;
        const day = Number(m[1]);
        const monthText = m[2];
        const monthMap = {
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
        if (month === undefined)
            return null;
        const year = now.getFullYear();
        const dt = new Date(year, month, day);
        return this.formatIsoDate(dt);
    }
    resolveDateTime(text) {
        const lower = text.toLowerCase();
        const date = this.parseDateOnly(text);
        const match = lower.match(/\b(\d{1,2})(?::(\d{2}))?\b/);
        if (!date && !match) {
            return null;
        }
        let hour = null;
        let minute = null;
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
    formatDateTimeLabel(value) {
        const [datePart, timePart] = value.split(' ');
        if (!datePart || !timePart)
            return value;
        const [y, m, d] = datePart.split('-');
        return `${d}.${m}.${y} ${timePart.slice(0, 5)}`;
    }
    formatDateLabel(value) {
        const [y, m, d] = value.split('-');
        return `${d}.${m}.${y}`;
    }
    formatIsoDate(date) {
        const pad = (n) => String(n).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }
    extractTimeLabel(value) {
        const [, time] = value.split(' ');
        return time ? time.slice(0, 5) : value;
    }
    extractAge(text) {
        const match = text.match(/\b(\d{1,2})\b/);
        if (!match)
            return null;
        const age = Number(match[1]);
        if (Number.isNaN(age) || age <= 0 || age > 99)
            return null;
        return age;
    }
    detectCleaningType(text) {
        const lower = text.toLowerCase();
        if (lower.includes('50к') || lower.includes('50000') || lower.includes('50 000')) {
            return 'prophylaxis_master';
        }
        if (lower.includes('prophylaxis'))
            return 'prophylaxis_master';
        if (lower.includes('air flow') || lower.includes('airflow')) {
            if (lower.includes('10') || lower.includes('16'))
                return 'airflow_glycine_10_16';
            return 'airflow_glycine_upto9';
        }
        if (lower.includes('лёгк') || lower.includes('легк') || lower.includes('жеңіл')) {
            return 'light_milk_bite';
        }
        if (lower.includes('средн') || lower.includes('орташа')) {
            return 'medium_milk_bite';
        }
        return null;
    }
    getCleaningTypeLabel(lang, type) {
        const mapRu = {
            light_milk_bite: 'лёгкая чистка (молочный прикус)',
            medium_milk_bite: 'средняя чистка (молочный прикус)',
            airflow_glycine_upto9: 'Air Flow с глицином (до 9 лет)',
            airflow_glycine_10_16: 'Air Flow с глицином (10–16 лет)',
            prophylaxis_master: 'Prophylaxis Master',
        };
        const mapKk = {
            light_milk_bite: 'жеңіл тазалау (сүт тістемі)',
            medium_milk_bite: 'орташа тазалау (сүт тістемі)',
            airflow_glycine_upto9: 'Air Flow глицинмен (9 жасқа дейін)',
            airflow_glycine_10_16: 'Air Flow глицинмен (10–16 жас)',
            prophylaxis_master: 'Prophylaxis Master',
        };
        return lang === 'kk' ? mapKk[type] : mapRu[type];
    }
    getCleaningTypePrice(type) {
        const prices = {
            light_milk_bite: 10000,
            medium_milk_bite: 16000,
            airflow_glycine_upto9: 25000,
            airflow_glycine_10_16: 35000,
            prophylaxis_master: 50000,
        };
        return prices[type];
    }
    extractDisplayName(patient) {
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
    getCurrentServiceLabel(session) {
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
    getDoctorNameById(doctorId) {
        if (!doctorId)
            return 'Врач не указан';
        return doctors_data_1.DOCTORS_DATA.find((item) => item.doctorId === doctorId)?.fullName || `Врач #${doctorId}`;
    }
    looksLikeCleaning(text) {
        const lower = text.toLowerCase();
        return (lower.includes('чист') ||
            lower.includes('чиста') ||
            lower.includes('тазала') ||
            lower.includes('air flow') ||
            lower.includes('airflow') ||
            lower.includes('prophylaxis') ||
            lower.includes('50к') ||
            lower.includes('50000'));
    }
    isCancelPhrase(lower) {
        return ['не надо', 'не нужно', 'неа', 'нет', 'жоқ', 'керек емес'].some((x) => lower.includes(x));
    }
};
exports.WhatsAppService = WhatsAppService;
exports.WhatsAppService = WhatsAppService = WhatsAppService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof dentist_service_1.DentistService !== "undefined" && dentist_service_1.DentistService) === "function" ? _a : Object, typeof (_b = typeof bitrix_service_1.BitrixService !== "undefined" && bitrix_service_1.BitrixService) === "function" ? _b : Object, typeof (_c = typeof whatsapp_session_1.WhatsAppSessionService !== "undefined" && whatsapp_session_1.WhatsAppSessionService) === "function" ? _c : Object, typeof (_d = typeof whatsapp_messages_1.WhatsAppMessagesService !== "undefined" && whatsapp_messages_1.WhatsAppMessagesService) === "function" ? _d : Object, typeof (_e = typeof gemini_nlu_service_1.GeminiNluService !== "undefined" && gemini_nlu_service_1.GeminiNluService) === "function" ? _e : Object])
], WhatsAppService);
class WhatsAppReplyError extends Error {
    constructor(reply) {
        super(reply);
        this.reply = reply;
    }
}
//# sourceMappingURL=whatsapp.service.js.map