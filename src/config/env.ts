import 'dotenv/config';

function getEnv(name: string, fallback?: string): string {
    const value = process.env[name] ?? fallback;

    if (value === undefined) {
        throw new Error(`Environment variable ${name} is required`);
    }

    return value;
}

export const env = {
    nodeEnv: getEnv('NODE_ENV', 'development'),
    port: Number(getEnv('PORT', '3000')),

    databaseUrl: getEnv('DATABASE_URL'),

    dentistApiBaseUrl: getEnv('DENTIST_API_BASE_URL'),
    dentistApiLogin: getEnv('DENTIST_API_LOGIN'),
    dentistApiPassword: getEnv('DENTIST_API_PASSWORD'),

    defaultBranchId: Number(getEnv('DEFAULT_BRANCH_ID', '1')),
    defaultPatientLastName: getEnv('DEFAULT_PATIENT_LASTNAME', 'Unknown'),
};