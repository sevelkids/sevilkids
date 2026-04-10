"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dentistConfig = void 0;
const env_1 = require("./env");
exports.dentistConfig = {
    baseUrl: env_1.env.dentistApiBaseUrl,
    login: env_1.env.dentistApiLogin,
    password: env_1.env.dentistApiPassword,
    defaultBranchId: env_1.env.defaultBranchId,
    defaultPatientLastName: env_1.env.defaultPatientLastName,
};
//# sourceMappingURL=dentist.config.js.map