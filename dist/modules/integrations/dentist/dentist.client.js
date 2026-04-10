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
var DentistClient_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DentistClient = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = __importDefault(require("axios"));
const dentist_config_1 = require("../../../config/dentist.config");
let DentistClient = DentistClient_1 = class DentistClient {
    constructor() {
        this.logger = new common_1.Logger(DentistClient_1.name);
        this.accessToken = null;
        this.http = axios_1.default.create({
            baseURL: dentist_config_1.dentistConfig.baseUrl,
            timeout: 20000,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }
    async authorize() {
        try {
            const { data } = await this.http.post('/auth', {
                login: dentist_config_1.dentistConfig.login,
                pass: dentist_config_1.dentistConfig.password,
            });
            if (!data?.token) {
                throw new Error('Dentist API did not return token');
            }
            this.accessToken = data.token;
            return this.accessToken;
        }
        catch (error) {
            this.logger.error('Dentist authorize failed');
            if (error?.response) {
                this.logger.error(`Status: ${error.response.status}`);
                this.logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
            }
            throw new common_1.BadGatewayException('Failed to authorize in Dentist Plus');
        }
    }
    async ensureToken() {
        if (this.accessToken) {
            return this.accessToken;
        }
        return this.authorize();
    }
    async request(method, url, options, retry = true) {
        const token = await this.ensureToken();
        try {
            const response = await this.http.request({
                method,
                url,
                data: options?.data,
                params: options?.params,
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            return response.data;
        }
        catch (error) {
            const status = error?.response?.status;
            if ((status === 401 || status === 403) && retry) {
                this.accessToken = null;
                await this.authorize();
                return this.request(method, url, options, false);
            }
            this.logger.error(`Dentist request failed: ${method} ${url}`);
            if (error?.response) {
                this.logger.error(`Status: ${error.response.status}`);
                this.logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
            }
            if (error?.config) {
                this.logger.error(`Request url: ${error.config.baseURL}${error.config.url}`);
                this.logger.error(`Request params: ${JSON.stringify(error.config.params)}`);
                this.logger.error(`Request data: ${JSON.stringify(error.config.data)}`);
            }
            throw new common_1.BadGatewayException(`Dentist request failed: ${url}`);
        }
    }
    async getBranches() {
        return this.request('GET', '/branches');
    }
    async getDoctors(params) {
        return this.request('GET', '/doctors', {
            params,
        });
    }
    async searchPatients(search) {
        return this.request('GET', '/patients', {
            params: { search },
        });
    }
    async createPatient(payload) {
        return this.request('POST', '/patients', {
            data: payload,
        });
    }
    async getSchedule(params) {
        return this.request('GET', '/schedule', {
            params,
        });
    }
    async getVisits(params) {
        const firstPage = await this.request('GET', '/visits', { params });
        const allData = [...firstPage.data];
        const lastPage = firstPage.meta?.last_page ?? 1;
        if (lastPage <= 1) {
            return {
                ...firstPage,
                data: allData,
            };
        }
        for (let page = 2; page <= lastPage; page++) {
            const nextPage = await this.request('GET', '/visits', {
                params: {
                    ...params,
                    page,
                },
            });
            allData.push(...nextPage.data);
        }
        return {
            ...firstPage,
            data: allData,
            meta: {
                ...firstPage.meta,
                current_page: 1,
                last_page: lastPage,
                total: allData.length,
            },
        };
    }
    async getVisit(visitId) {
        return this.request('GET', `/visits/${visitId}`);
    }
    async createVisit(payload) {
        return this.request('POST', '/visits', {
            data: payload,
        });
    }
    async updateVisit(visitId, payload) {
        return this.request('PUT', `/visits/${visitId}`, {
            data: payload,
        });
    }
    async cancelVisit(visitId, reason) {
        return this.request('POST', `/visits/${visitId}/cancel`, {
            data: {
                reason,
            },
        });
    }
};
exports.DentistClient = DentistClient;
exports.DentistClient = DentistClient = DentistClient_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], DentistClient);
//# sourceMappingURL=dentist.client.js.map