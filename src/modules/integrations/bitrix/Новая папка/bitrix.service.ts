import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

type BitrixPhoneField = {
    VALUE: string;
    VALUE_TYPE: 'WORK' | 'MOBILE' | 'HOME' | 'OTHER';
};

type BitrixContact = {
    ID: string;
    NAME?: string;
    LAST_NAME?: string;
    SECOND_NAME?: string;
    PHONE?: BitrixPhoneField[];
};

type BitrixDeal = {
    ID: string;
    TITLE?: string;
    CATEGORY_ID?: string | number;
    STAGE_ID?: string;
    CONTACT_ID?: string | number;
    COMMENTS?: string;
};

type BitrixListResponse<T> = {
    result: T[];
    total?: number;
};

type BitrixAddResponse = {
    result: number | string;
};

type BitrixMethodResponse<T> = {
    result: T;
};

@Injectable()
export class BitrixService {
    private readonly logger = new Logger(BitrixService.name);
    private readonly http: AxiosInstance;
    private readonly webhookUrl: string;
    private readonly defaultAssignedById: number;

    private readonly UF = {
        CONTACT_DENTIST_PLUS_ID: 'UF_CRM_1773483540591',
        CONTACT_NORMALIZED_PHONE: 'UF_CRM_1773483553643',

        DEAL_DENTIST_PLUS_PATIENT_ID: 'UF_CRM_1773483593452',
        DEAL_DENTIST_PLUS_VISIT_ID: 'UF_CRM_1773483603764',
        DEAL_CHANNEL_SOURCE: 'UF_CRM_1773483785404',
    };

    private readonly ENUM = {
        DEAL_CHANNEL_SOURCE: {
            WHATSAPP: 45,
            CALL: 47,
            SITE: 49,
            INSTAGRAM: 51,
            OTHER: 53,
        },
    };

    private readonly pipelines = {
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

    constructor() {
        this.webhookUrl = (process.env.BITRIX_WEBHOOK_URL || '').replace(/\/+$/, '');
        this.defaultAssignedById = Number(process.env.BITRIX_DEFAULT_ASSIGNED_BY_ID || 1);

        if (!this.webhookUrl) {
            throw new InternalServerErrorException('BITRIX_WEBHOOK_URL is not configured');
        }

        this.http = axios.create({
            baseURL: this.webhookUrl,
            timeout: 15000,
        });
    }

    normalizePhone(phone: string): string {
        const digits = (phone || '').replace(/\D/g, '');

        if (!digits) return '';

        if (digits.length === 11 && digits.startsWith('8')) {
            return `7${digits.slice(1)}`;
        }

        if (digits.length === 10) {
            return `7${digits}`;
        }

        return digits;
    }

    private phoneVariants(phone: string): string[] {
        const normalized = this.normalizePhone(phone);
        if (!normalized) return [];

        const variants = new Set<string>();
        variants.add(normalized);

        if (normalized.startsWith('7') && normalized.length === 11) {
            variants.add(`+${normalized}`);
            variants.add(`8${normalized.slice(1)}`);
        }

        return Array.from(variants);
    }

    private async call<T>(method: string, data?: Record<string, unknown>): Promise<T> {
        try {
            const response = await this.http.post<T>(`/${method}.json`, data ?? {});
            return response.data;
        } catch (error: any) {
            const payload = error?.response?.data || error?.message || error;
            this.logger.error(`Bitrix call failed: ${method}`, JSON.stringify(payload));
            throw new InternalServerErrorException(`Bitrix API error on ${method}`);
        }
    }

    async findContactByPhone(phone: string): Promise<BitrixContact | null> {
        const variants = this.phoneVariants(phone);

        for (const value of variants) {
            const duplicateResponse = await this.call<{ result: { CONTACT?: string[] } }>(
                'crm.duplicate.findbycomm',
                {
                    type: 'PHONE',
                    values: [value],
                },
            );

            const ids = duplicateResponse?.result?.CONTACT || [];
            if (!ids.length) continue;

            const contactId = ids[0];
            const contactResponse = await this.call<BitrixMethodResponse<BitrixContact>>(
                'crm.contact.get',
                { id: contactId },
            );

            if (contactResponse?.result) {
                return contactResponse.result;
            }
        }

        return null;
    }

    async updateDealTitle(dealId: number, title: string): Promise<void> {
        await this.call('crm.deal.update', {
            id: dealId,
            fields: {
                TITLE: title,
            },
        });
    }

    async updateDealAmount(dealId: number, amount: number): Promise<void> {
        await this.call('crm.deal.update', {
            id: dealId,
            fields: {
                OPPORTUNITY: amount,
            },
        });
    }

    async updateDealTitleAndAmount(
        dealId: number,
        input: {
            title?: string;
            amount?: number | null;
        },
    ): Promise<void> {
        const fields: Record<string, unknown> = {};

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

    async closeRequestDealAsLost(dealId: number, reason?: string): Promise<void> {
        await this.updateDealStage(dealId, this.pipelines.requests.stages.LOSE);

        if (reason) {
            await this.appendDealComment(dealId, reason);
        }
    }

    async findContactByDentistPlusPatientId(
        dentistPlusPatientId: number | string,
    ): Promise<BitrixContact | null> {
        const response = await this.call<BitrixListResponse<BitrixContact>>('crm.contact.list', {
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

    async createContact(input: {
        firstName?: string;
        lastName?: string;
        middleName?: string;
        fullName?: string;
        phone: string;
        dentistPlusPatientId?: number | string;
    }): Promise<number> {
        const normalized = this.normalizePhone(input.phone);
        const name =
            input.firstName?.trim() ||
            input.fullName?.trim() ||
            'Новый пациент';

        const lastName = input.lastName?.trim() || '';

        const response = await this.call<BitrixAddResponse>('crm.contact.add', {
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

    async updateContact(contactId: number, input: {
        firstName?: string;
        lastName?: string;
        middleName?: string;
        fullName?: string;
        phone?: string;
        dentistPlusPatientId?: number | string;
    }): Promise<void> {
        const fields: Record<string, unknown> = {
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

    async findOpenRequestDealByContactId(contactId: number): Promise<BitrixDeal | null> {
        const response = await this.call<BitrixListResponse<BitrixDeal>>('crm.deal.list', {
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

    async findVisitDealByDentistPlusVisitId(
        dentistPlusVisitId: number | string,
    ): Promise<BitrixDeal | null> {
        const response = await this.call<BitrixListResponse<BitrixDeal>>('crm.deal.list', {
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

    async createRequestDeal(input: {
        contactId: number;
        phone: string;
        patientName?: string;
        message: string;
        dentistPlusPatientId?: number | string;
    }): Promise<number> {
        const normalized = this.normalizePhone(input.phone);
        const title = `Заявка: ${input.patientName?.trim() || normalized}`;

        const response = await this.call<BitrixAddResponse>('crm.deal.add', {
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

    async updateRequestDeal(dealId: number, input: {
        message?: string;
        dentistPlusPatientId?: number | string;
        channelSourceId?: number;
    }): Promise<void> {
        const fields: Record<string, unknown> = {};

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

    async createVisitDeal(input: {
        patientName?: string;
        phone?: string;
        contactId?: number;
        doctorId: number;
        branchId: number;
        start: string;
        end: string;
        dentistPlusPatientId?: number | string;
        dentistPlusVisitId?: number | string;
        comment?: string;
    }): Promise<number> {
        const title = `Визит: ${input.patientName?.trim() || input.phone || 'Пациент'} — ${input.start}`;

        const response = await this.call<BitrixAddResponse>('crm.deal.add', {
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

    async updateVisitDeal(
        dealId: number,
        input: {
            dentistPlusPatientId?: number | string;
            dentistPlusVisitId?: number | string;
            doctorId: number;
            branchId: number;
            start: string;
            end: string;
            comment?: string;
        },
    ): Promise<void> {
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

    async updateDealStage(dealId: number, stageId: string): Promise<void> {
        await this.call('crm.deal.update', {
            id: dealId,
            fields: {
                STAGE_ID: stageId,
            },
        });
    }

    async appendDealComment(dealId: number, text: string): Promise<void> {
        const deal = await this.call<BitrixMethodResponse<BitrixDeal>>('crm.deal.get', {
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

    async ensureContactAndRequestDeal(input: {
        phone: string;
        message: string;
        firstName?: string;
        lastName?: string;
        middleName?: string;
        fullName?: string;
        dentistPlusPatientId?: number | string;
    }): Promise<{
        contactId: number;
        dealId: number;
        contactCreated: boolean;
        dealCreated: boolean;
    }> {
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
        } else {
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
                patientName:
                    input.fullName ||
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

    async ensureVisitDealAndMoveRequest(input: {
        patientId: number;
        doctorId: number;
        branchId: number;
        start: string;
        end: string;
        dentistPlusVisitId: number | string;
        visitComment?: string;
    }): Promise<{
        contactId: number;
        requestDealId: number | null;
        visitDealId: number;
        visitDealCreated: boolean;
        movedRequestStageTo: string;
    }> {
        const contact = await this.findContactByDentistPlusPatientId(input.patientId);

        if (!contact?.ID) {
            throw new InternalServerErrorException(
                `Bitrix contact not found for Dentist Plus patient ${input.patientId}`,
            );
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
        } else {
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
            await this.updateDealStage(
                Number(requestDeal.ID),
                this.pipelines.requests.stages.BOOKED,
            );
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
}