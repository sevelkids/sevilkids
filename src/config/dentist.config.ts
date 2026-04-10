import { env } from './env';

export const dentistConfig = {
    baseUrl: env.dentistApiBaseUrl,
    login: env.dentistApiLogin,
    password: env.dentistApiPassword,
    defaultBranchId: env.defaultBranchId,
    defaultPatientLastName: env.defaultPatientLastName,
};