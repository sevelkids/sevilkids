"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
require("dotenv/config");
function getEnv(name, fallback) {
    const value = process.env[name] ?? fallback;
    if (value === undefined) {
        throw new Error(`Environment variable ${name} is required`);
    }
    return value;
}
exports.env = {
    nodeEnv: getEnv('NODE_ENV', 'development'),
    port: Number(getEnv('PORT', '3000')),
    databaseUrl: getEnv('DATABASE_URL'),
    dentistApiBaseUrl: getEnv('DENTIST_API_BASE_URL'),
    dentistApiLogin: getEnv('DENTIST_API_LOGIN'),
    dentistApiPassword: getEnv('DENTIST_API_PASSWORD'),
    defaultBranchId: Number(getEnv('DEFAULT_BRANCH_ID', '1')),
    defaultPatientLastName: getEnv('DEFAULT_PATIENT_LASTNAME', 'Unknown'),
};
//# sourceMappingURL=env.js.map