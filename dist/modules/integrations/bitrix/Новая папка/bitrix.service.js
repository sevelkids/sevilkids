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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var BitrixService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BitrixService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = __importDefault(require("axios"));
let BitrixService = BitrixService_1 = class BitrixService {
    constructor() {
        this.logger = new common_1.Logger(BitrixService_1.name);
        this.UF = {
            CONTACT_DENTIST_PLUS_ID: 'UF_CRM_1773483540591',
            CONTACT_NORMALIZED_PHONE: 'UF_CRM_1773483553643',
            DEAL_DENTIST_PLUS_PATIENT_ID: 'UF_CRM_1773483593452',
            DEAL_DENTIST_PLUS_VISIT_ID: 'UF_CRM_1773483603764',
            DEAL_CHANNEL_SOURCE: 'UF_CRM_1773483785404',
        };
        this.ENUM = {
            DEAL_CHANNEL_SOURCE: {
                WHATSAPP: 45,
                CALL: 47,
                SITE: 49,
                INSTAGRAM: 51,
                OTHER: 53,
            },
        };
        this.pipelines = {
            requests: {
                categoryId: 0,
                stages: {
                    NEW: 'NEW',
                    THINKING: 'PREPARATION',
                    NO_ANSWER: 'PREPAYMENT_INVOICE',
                    BOOKED: 'EXECUTING',
                    NO_SHOW: 'FINAL_INVOICE',
                    WON: 'WON',
                    LOSE: 'LOSE',
                },
            },
            tasksAndCalls: {
                categoryId: 1,
                stages: {
                    PRIMARY: 'C1:NEW',
                    SECONDARY: 'C1:PREPARATION',
                    OVERDUE: 'C1:PREPAYMENT_INVOICE',
                    DONE: 'C1:EXECUTING',
                },
            },
            visits: {
                categoryId: 3,
                stages: {
                    NEW: 'C3:NEW',
                    SECONDARY: 'C3:PREPARATION',
                    WAITING_LIST: 'C3:PREPAYMENT_INVOICE',
                    WON: 'C3:WON',
                    LOSE: 'C3:LOSE',
                },
            },
        };
        this.webhookUrl = (process.env.BITRIX_WEBHOOK_URL || '').replace(/\/+$/, '');
        this.defaultAssignedById = Number(process.env.BITRIX_DEFAULT_ASSIGNED_BY_ID || 1);
        if (!this.webhookUrl) {
            throw new common_1.InternalServerErrorException('BITRIX_WEBHOOK_URL is not configured');
        }
        this.http = axios_1.default.create({
            baseURL: this.webhookUrl,
            timeout: 15000,
        });
    }
    normalizePhone(phone) {
        const digits = (phone || '').replace(/\D/g, '');
        if (!digits)
            return '';
        if (digits.length === 11 && digits.startsWith('8')) {
            return `7${digits.slice(1)}`;
        }
        if (digits.length === 10) {
            return `7${digits}`;
        }
        return digits;
    }
    phoneVariants(phone) {
        const normalized = this.normalizePhone(phone);
        if (!normalized)
            return [];
        const variants = new Set();
        variants.add(normalized);
        if (normalized.startsWith('7') && normalized.length === 11) {
            variants.add(`+${normalized}`);
            variants.add(`8${normalized.slice(1)}`);
        }
        return Array.from(variants);
    }
    async call(method, data) {
        try {
            const response = await this.http.post(`/${method}.json`, data ?? {});
            return response.data;
        }
        catch (error) {
            const payload = error?.response?.data || error?.message || error;
            this.logger.error(`Bitrix call failed: ${method}`, JSON.stringify(payload));
            throw new common_1.InternalServerErrorException(`Bitrix API error on ${method}`);
        }
    }
    async findContactByPhone(phone) {
        const variants = this.phoneVariants(phone);
        for (const value of variants) {
            const duplicateResponse = await this.call('crm.duplicate.findbycomm', {
                type: 'PHONE',
                values: [value],
            });
            const ids = duplicateResponse?.result?.CONTACT || [];
            if (!ids.length)
                continue;
            const contactId = ids[0];
            const contactResponse = await this.call('crm.contact.get', { id: contactId });
            if (contactResponse?.result) {
                return contactResponse.result;
            }
        }
        return null;
    }
    async updateDealTitle(dealId, title) {
        await this.call('crm.deal.update', {
            id: dealId,
            fields: {
                TITLE: title,
            },
        });
    }
    async updateDealAmount(dealId, amount) {
        await this.call('crm.deal.update', {
            id: dealId,
            fields: {
                OPPORTUNITY: amount,
            },
        });
    }
    async updateDealTitleAndAmount(dealId, input) {
        const fields = {};
        if (input.title) {
            fields.TITLE = input.title;
        }
        if (typeof input.amount === 'number') {
            fields.OPPORTUNITY = input.amount;
        }
        if (!Object.keys(fields).length) {
            return;
        }
        await this.call('crm.deal.update', {
            id: dealId,
            fields,
        });
    }
    async closeRequestDealAsLost(dealId, reason) {
        await this.updateDealStage(dealId, this.pipelines.requests.stages.LOSE);
        if (reason) {
            await this.appendDealComment(dealId, reason);
        }
    }
    async findContactByDentistPlusPatientId(dentistPlusPatientId) {
        const response = await this.call('crm.contact.list', {
            filter: {
                [this.UF.CONTACT_DENTIST_PLUS_ID]: String(dentistPlusPatientId),
            },
            select: ['ID', 'NAME', 'LAST_NAME', 'SECOND_NAME', 'PHONE'],
            order: {
                ID: 'DESC',
            },
        });
        return response.result?.[0] || null;
    }
    async createContact(input) {
        const normalized = this.normalizePhone(input.phone);
        const name = input.firstName?.trim() ||
            input.fullName?.trim() ||
            'Новый пациент';
        const lastName = input.lastName?.trim() || '';
        const response = await this.call('crm.contact.add', {
            fields: {
                NAME: name,
                LAST_NAME: lastName,
                SECOND_NAME: input.middleName?.trim() || '',
                PHONE: [
                    {
                        VALUE: normalized,
                        VALUE_TYPE: 'WORK',
                    },
                ],
                ASSIGNED_BY_ID: this.defaultAssignedById,
                OPENED: 'Y',
                [this.UF.CONTACT_DENTIST_PLUS_ID]: input.dentistPlusPatientId
                    ? String(input.dentistPlusPatientId)
                    : '',
                [this.UF.CONTACT_NORMALIZED_PHONE]: normalized,
            },
        });
        return Number(response.result);
    }
    async updateContact(contactId, input) {
        const fields = {
            NAME: input.firstName?.trim() || input.fullName?.trim() || 'Пациент',
            LAST_NAME: input.lastName?.trim() || '',
            SECOND_NAME: input.middleName?.trim() || '',
        };
        if (input.phone) {
            const normalized = this.normalizePhone(input.phone);
            fields.PHONE = [
                {
                    VALUE: normalized,
                    VALUE_TYPE: 'WORK',
                },
            ];
            fields[this.UF.CONTACT_NORMALIZED_PHONE] = normalized;
        }
        if (input.dentistPlusPatientId) {
            fields[this.UF.CONTACT_DENTIST_PLUS_ID] = String(input.dentistPlusPatientId);
        }
        await this.call('crm.contact.update', {
            id: contactId,
            fields,
        });
    }
    async findOpenRequestDealByContactId(contactId) {
        const response = await this.call('crm.deal.list', {
            filter: {
                CONTACT_ID: contactId,
                CATEGORY_ID: this.pipelines.requests.categoryId,
                CLOSED: 'N',
            },
            select: ['ID', 'TITLE', 'CATEGORY_ID', 'STAGE_ID', 'CONTACT_ID', 'COMMENTS'],
            order: {
                ID: 'DESC',
            },
        });
        return response.result?.[0] || null;
    }
    async findVisitDealByDentistPlusVisitId(dentistPlusVisitId) {
        const response = await this.call('crm.deal.list', {
            filter: {
                CATEGORY_ID: this.pipelines.visits.categoryId,
                [this.UF.DEAL_DENTIST_PLUS_VISIT_ID]: String(dentistPlusVisitId),
            },
            select: ['ID', 'TITLE', 'CATEGORY_ID', 'STAGE_ID', 'CONTACT_ID', 'COMMENTS'],
            order: {
                ID: 'DESC',
            },
        });
        return response.result?.[0] || null;
    }
    async createRequestDeal(input) {
        const normalized = this.normalizePhone(input.phone);
        const title = `Заявка: ${input.patientName?.trim() || normalized}`;
        const response = await this.call('crm.deal.add', {
            fields: {
                TITLE: title,
                CATEGORY_ID: this.pipelines.requests.categoryId,
                STAGE_ID: this.pipelines.requests.stages.NEW,
                CONTACT_ID: input.contactId,
                ASSIGNED_BY_ID: this.defaultAssignedById,
                OPENED: 'Y',
                COMMENTS: `Первичное сообщение: ${input.message}`,
                PHONE: [
                    {
                        VALUE: normalized,
                        VALUE_TYPE: 'WORK',
                    },
                ],
                [this.UF.DEAL_DENTIST_PLUS_PATIENT_ID]: input.dentistPlusPatientId
                    ? String(input.dentistPlusPatientId)
                    : '',
                [this.UF.DEAL_CHANNEL_SOURCE]: this.ENUM.DEAL_CHANNEL_SOURCE.WHATSAPP,
            },
        });
        return Number(response.result);
    }
    async updateRequestDeal(dealId, input) {
        const fields = {};
        if (input.dentistPlusPatientId) {
            fields[this.UF.DEAL_DENTIST_PLUS_PATIENT_ID] = String(input.dentistPlusPatientId);
        }
        if (input.channelSourceId) {
            fields[this.UF.DEAL_CHANNEL_SOURCE] = input.channelSourceId;
        }
        if (Object.keys(fields).length > 0) {
            await this.call('crm.deal.update', {
                id: dealId,
                fields,
            });
        }
        if (input.message) {
            await this.appendDealComment(dealId, `Новое входящее сообщение: ${input.message}`);
        }
    }
    async createVisitDeal(input) {
        const title = `Визит: ${input.patientName?.trim() || input.phone || 'Пациент'} — ${input.start}`;
        const response = await this.call('crm.deal.add', {
            fields: {
                TITLE: title,
                CATEGORY_ID: this.pipelines.visits.categoryId,
                STAGE_ID: this.pipelines.visits.stages.NEW,
                CONTACT_ID: input.contactId,
                ASSIGNED_BY_ID: this.defaultAssignedById,
                OPENED: 'Y',
                COMMENTS: input.comment || '',
                [this.UF.DEAL_DENTIST_PLUS_PATIENT_ID]: input.dentistPlusPatientId
                    ? String(input.dentistPlusPatientId)
                    : '',
                [this.UF.DEAL_DENTIST_PLUS_VISIT_ID]: input.dentistPlusVisitId
                    ? String(input.dentistPlusVisitId)
                    : '',
            },
        });
        return Number(response.result);
    }
    async updateVisitDeal(dealId, input) {
        await this.call('crm.deal.update', {
            id: dealId,
            fields: {
                [this.UF.DEAL_DENTIST_PLUS_PATIENT_ID]: input.dentistPlusPatientId
                    ? String(input.dentistPlusPatientId)
                    : '',
                [this.UF.DEAL_DENTIST_PLUS_VISIT_ID]: input.dentistPlusVisitId
                    ? String(input.dentistPlusVisitId)
                    : '',
                COMMENTS: input.comment || '',
            },
        });
    }
    async updateDealStage(dealId, stageId) {
        await this.call('crm.deal.update', {
            id: dealId,
            fields: {
                STAGE_ID: stageId,
            },
        });
    }
    async appendDealComment(dealId, text) {
        const deal = await this.call('crm.deal.get', {
            id: dealId,
        });
        const existingComments = deal?.result?.COMMENTS?.trim() || '';
        const nextComments = existingComments
            ? `${existingComments}\n\n${text}`
            : text;
        await this.call('crm.deal.update', {
            id: dealId,
            fields: {
                COMMENTS: nextComments,
            },
        });
    }
    async ensureContactAndRequestDeal(input) {
        let contact = await this.findContactByPhone(input.phone);
        let contactCreated = false;
        if (!contact) {
            const contactId = await this.createContact({
                firstName: input.firstName,
                lastName: input.lastName,
                middleName: input.middleName,
                fullName: input.fullName,
                phone: input.phone,
                dentistPlusPatientId: input.dentistPlusPatientId,
            });
            contact = { ID: String(contactId) };
            contactCreated = true;
        }
        else {
            await this.updateContact(Number(contact.ID), {
                firstName: input.firstName,
                lastName: input.lastName,
                middleName: input.middleName,
                fullName: input.fullName,
                phone: input.phone,
                dentistPlusPatientId: input.dentistPlusPatientId,
            });
        }
        let deal = await this.findOpenRequestDealByContactId(Number(contact.ID));
        if (!deal) {
            const dealId = await this.createRequestDeal({
                contactId: Number(contact.ID),
                phone: input.phone,
                patientName: input.fullName ||
                    [input.lastName, input.firstName, input.middleName]
                        .filter(Boolean)
                        .join(' ')
                        .trim(),
                message: input.message,
                dentistPlusPatientId: input.dentistPlusPatientId,
            });
            return {
                contactId: Number(contact.ID),
                dealId,
                contactCreated,
                dealCreated: true,
            };
        }
        await this.updateRequestDeal(Number(deal.ID), {
            message: input.message,
            dentistPlusPatientId: input.dentistPlusPatientId,
            channelSourceId: this.ENUM.DEAL_CHANNEL_SOURCE.WHATSAPP,
        });
        return {
            contactId: Number(contact.ID),
            dealId: Number(deal.ID),
            contactCreated,
            dealCreated: false,
        };
    }
    async ensureVisitDealAndMoveRequest(input) {
        const contact = await this.findContactByDentistPlusPatientId(input.patientId);
        if (!contact?.ID) {
            throw new common_1.InternalServerErrorException(`Bitrix contact not found for Dentist Plus patient ${input.patientId}`);
        }
        const requestDeal = await this.findOpenRequestDealByContactId(Number(contact.ID));
        let visitDeal = await this.findVisitDealByDentistPlusVisitId(input.dentistPlusVisitId);
        let visitDealCreated = false;
        if (!visitDeal) {
            const visitDealId = await this.createVisitDeal({
                patientName: undefined,
                contactId: Number(contact.ID),
                doctorId: input.doctorId,
                branchId: input.branchId,
                start: input.start,
                end: input.end,
                dentistPlusPatientId: input.patientId,
                dentistPlusVisitId: input.dentistPlusVisitId,
                comment: input.visitComment,
            });
            visitDeal = { ID: String(visitDealId) };
            visitDealCreated = true;
        }
        else {
            await this.updateVisitDeal(Number(visitDeal.ID), {
                dentistPlusPatientId: input.patientId,
                dentistPlusVisitId: input.dentistPlusVisitId,
                doctorId: input.doctorId,
                branchId: input.branchId,
                start: input.start,
                end: input.end,
                comment: input.visitComment,
            });
        }
        if (requestDeal?.ID) {
            await this.updateDealStage(Number(requestDeal.ID), this.pipelines.requests.stages.BOOKED);
        }
        return {
            contactId: Number(contact.ID),
            requestDealId: requestDeal?.ID ? Number(requestDeal.ID) : null,
            visitDealId: Number(visitDeal.ID),
            visitDealCreated,
            movedRequestStageTo: this.pipelines.requests.stages.BOOKED,
        };
    }
    getStageIds() {
        return this.pipelines;
    }
};
exports.BitrixService = BitrixService;
exports.BitrixService = BitrixService = BitrixService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], BitrixService);
//# sourceMappingURL=bitrix.service.js.map