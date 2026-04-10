export type BitrixPhoneField = {
    VALUE: string;
    VALUE_TYPE: 'WORK' | 'MOBILE' | 'HOME' | 'OTHER';
};

export type BitrixContact = {
    ID: string;
    NAME?: string;
    LAST_NAME?: string;
    SECOND_NAME?: string;
    PHONE?: BitrixPhoneField[];
};

export type BitrixDeal = {
    ID: string;
    TITLE?: string;
    CATEGORY_ID?: string | number;
    STAGE_ID?: string;
    CONTACT_ID?: string | number;
    COMMENTS?: string;
};

export type BitrixListResponse<T> = {
    result: T[];
    total?: number;
};

export type BitrixAddResponse = {
    result: number | string;
};

export type BitrixMethodResponse<T> = {
    result: T;
};

export type EnsureBitrixPatientResult = {
    contactId: number;
    dealId: number;
    dealCreated: boolean;
    contactCreated: boolean;
};