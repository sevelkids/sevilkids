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
var BitrixOpenLinesService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BitrixOpenLinesService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = __importDefault(require("axios"));
const prisma_service_1 = require("../../../prisma/prisma.service");
const bitrix_service_1 = require("./bitrix.service");
let BitrixOpenLinesService = BitrixOpenLinesService_1 = class BitrixOpenLinesService {
    constructor(bitrixService, prisma) {
        this.bitrixService = bitrixService;
        this.prisma = prisma;
        this.logger = new common_1.Logger(BitrixOpenLinesService_1.name);
        this.enabled = String(process.env.BITRIX_OPENLINE_ENABLED || 'false').toLowerCase() === 'true';
        this.connectorId = process.env.BITRIX_OPENLINE_CONNECTOR_ID || '';
        this.lineId = process.env.BITRIX_OPENLINE_LINE_ID || '';
        this.appMode = process.env.BITRIX_OPENLINE_APP_MODE || 'webhook';
        this.publicBaseUrl = (process.env.BITRIX_OPENLINE_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
        this.connectorName = process.env.BITRIX_OPENLINE_CONNECTOR_NAME || 'Sevil Kids WhatsApp';
    }
    isEnabled() {
        return this.enabled;
    }
    getConfigSnapshot() {
        return {
            enabled: this.enabled,
            connectorId: this.connectorId || null,
            lineId: this.lineId || null,
            appMode: this.appMode,
            publicBaseUrl: this.publicBaseUrl || null,
        };
    }
    async getInstallAuthSnapshot() {
        const stored = await this.getLatestInstallAuth();
        if (!stored)
            return null;
        return {
            ...stored,
            accessToken: this.maskSecret(stored.accessToken),
            refreshToken: this.maskSecret(stored.refreshToken),
            applicationToken: this.maskSecret(stored.applicationToken),
        };
    }
    async handleInstallCallback(payload, context = {}) {
        const normalizedPayload = this.normalizePayload(payload);
        const event = this.pickString(normalizedPayload, ['event', 'EVENT']) || 'install';
        const placement = this.pickString(normalizedPayload, ['placement', 'PLACEMENT']);
        const auth = this.extractInstallAuth(normalizedPayload);
        const hasAuthPayload = Boolean(auth.accessToken || auth.refreshToken);
        this.logger.log(`Received Bitrix Open Lines install callback event=${event} placement=${placement || 'n/a'} appMode=${this.appMode}`);
        this.logger.debug(JSON.stringify({
            message: 'Bitrix install callback payload received',
            event,
            method: context.method || null,
            contentType: context.contentType || null,
            hasAuthPayload,
            bodyKeys: Object.keys(normalizedPayload).sort(),
            memberId: auth.memberId,
            domain: auth.domain,
            authPreview: {
                accessToken: this.maskSecret(auth.accessToken),
                refreshToken: this.maskSecret(auth.refreshToken),
                applicationToken: this.maskSecret(auth.applicationToken),
                expiresIn: auth.expiresIn,
                scope: auth.scope,
                status: auth.status,
                clientEndpoint: auth.clientEndpoint,
                serverEndpoint: auth.serverEndpoint,
            },
        }));
        let persistedAuth = null;
        let note = 'Manual JSON tests usually do not include Bitrix OAuth install payload.';
        if (hasAuthPayload) {
            persistedAuth = await this.persistInstallAuth(auth, normalizedPayload);
            if (persistedAuth) {
                this.logger.log(`Bitrix install auth payload persisted successfully for domain=${persistedAuth.domain} memberId=${persistedAuth.memberId}`);
                note = 'Install callback accepted, OAuth payload persisted, and connector readiness check started.';
                await this.ensureConnectorReadyAfterInstall(persistedAuth);
            }
            else {
                note = 'OAuth payload was received, but persistence could not be completed. Check database connectivity.';
            }
        }
        return {
            ok: true,
            received: true,
            event,
            placement,
            contentType: context.contentType || null,
            hasAuthPayload,
            memberId: auth.memberId,
            domain: auth.domain,
            authPreview: {
                accessToken: this.maskSecret(auth.accessToken),
                refreshToken: this.maskSecret(auth.refreshToken),
                applicationToken: this.maskSecret(auth.applicationToken),
                expiresIn: auth.expiresIn,
                scope: auth.scope,
                status: auth.status,
            },
            installAuthStored: Boolean(persistedAuth),
            config: this.getConfigSnapshot(),
            note,
        };
    }
    async handleAppEvent(payload) {
        const normalizedPayload = this.normalizePayload(payload);
        const event = this.pickString(normalizedPayload, ['event', 'EVENT', 'type']) || 'unknown';
        const dialogId = this.pickString(normalizedPayload, ['dialog_id', 'DIALOG_ID', 'chatId']) || null;
        const operatorId = this.pickString(normalizedPayload, ['operator_id', 'OPERATOR_ID']) || null;
        this.logger.log(`Received Bitrix Open Lines app event=${event} dialogId=${dialogId || 'n/a'} operatorId=${operatorId || 'n/a'}`);
        return { ok: true, received: true, event, dialogId, operatorId, config: this.getConfigSnapshot() };
    }
    async handleDeliveryCallback(payload) {
        const normalizedPayload = this.normalizePayload(payload);
        const event = this.pickString(normalizedPayload, ['event', 'EVENT']) || 'delivery';
        this.logger.log(`Received Bitrix Open Lines delivery callback event=${event}`);
        return { ok: true, received: true, event, config: this.getConfigSnapshot() };
    }
    async forwardClientMessage(session, input) {
        if (!this.enabled)
            return { forwarded: false, reason: 'BITRIX_OPENLINE_ENABLED=false' };
        if (!this.connectorId || !this.lineId) {
            return { forwarded: false, reason: 'Bitrix Open Lines connector env vars are not configured' };
        }
        this.logger.log(`Open Lines forward placeholder for ${session.normalizedPhone}`);
        if (session.leadId) {
            try {
                await this.bitrixService.appendDealComment(session.leadId, `Open Lines mirror: incoming client message${input.whatsappMessageId ? ` (${input.whatsappMessageId})` : ''}\n${input.text}`);
            }
            catch (error) {
                this.logger.warn(`Failed to append Open Lines mirror comment for deal ${session.leadId}: ${error?.message || error}`);
            }
        }
        return { forwarded: true };
    }
    async handleOperatorEvent(session, input) {
        if (input.lineId)
            session.bitrixLineId = input.lineId;
        if (input.chatId)
            session.bitrixChatId = input.chatId;
        if (input.dialogId)
            session.bitrixDialogId = input.dialogId;
        if (this.connectorId)
            session.bitrixConnectorId = this.connectorId;
        if (input.operatorId)
            session.assignedOperatorId = input.operatorId;
        this.logger.log(`Received Bitrix operator event ${input.eventType} for ${session.normalizedPhone}`);
        if (session.leadId) {
            try {
                await this.bitrixService.appendDealComment(session.leadId, `Bitrix operator event: ${input.eventType}${input.operatorId ? `, operator=${input.operatorId}` : ''}`);
            }
            catch (error) {
                this.logger.warn(`Failed to append Bitrix operator event comment for deal ${session.leadId}: ${error?.message || error}`);
            }
        }
        return { ok: true, ...this.getConfigSnapshot() };
    }
    async registerConnector(authOverride) {
        const auth = authOverride || (await this.getLatestInstallAuth());
        if (!auth) {
            const reason = 'Install auth payload is not persisted yet';
            this.logger.warn(`Open Lines connector registration skipped: ${reason}`);
            return { attempted: false, success: false, skipped: true, reason };
        }
        if (!this.connectorId) {
            const reason = 'BITRIX_OPENLINE_CONNECTOR_ID is missing';
            this.logger.warn(`Open Lines connector registration skipped: ${reason}`);
            await this.updateInstallStatuses(auth.id, { connectorRegistrationStatus: 'skipped_missing_connector_id', lastError: reason });
            return { attempted: false, success: false, skipped: true, reason };
        }
        if (!this.publicBaseUrl) {
            const reason = 'BITRIX_OPENLINE_PUBLIC_BASE_URL is missing';
            this.logger.warn(`Open Lines connector registration skipped: ${reason}`);
            await this.updateInstallStatuses(auth.id, { connectorRegistrationStatus: 'skipped_missing_public_base_url', lastError: reason });
            return { attempted: false, success: false, skipped: true, reason };
        }
        const response = await this.callBitrixAppMethod(auth, 'imconnector.register', this.buildRegisterPayload());
        if (!response.ok) {
            const reason = response.error || 'imconnector.register failed';
            this.logger.warn(`Open Lines connector registration failed: ${reason}`);
            await this.updateInstallStatuses(auth.id, { connectorRegistrationStatus: 'failed', lastError: reason });
            return { attempted: true, success: false, skipped: false, reason, response: response.data };
        }
        this.logger.log(`Open Lines connector registration succeeded for connectorId=${this.connectorId}`);
        await this.updateInstallStatuses(auth.id, {
            connectorId: this.connectorId,
            connectorRegisteredAt: new Date(),
            connectorRegistrationStatus: 'registered',
            lastError: null,
        });
        return { attempted: true, success: true, skipped: false, response: response.data };
    }
    async activateConnector(authOverride) {
        const auth = authOverride || (await this.getLatestInstallAuth());
        if (!auth) {
            const reason = 'Install auth payload is not persisted yet';
            this.logger.warn(`Open Lines connector activation skipped: ${reason}`);
            return { attempted: false, success: false, skipped: true, reason };
        }
        if (!this.connectorId) {
            const reason = 'BITRIX_OPENLINE_CONNECTOR_ID is missing';
            this.logger.warn(`Open Lines connector activation skipped: ${reason}`);
            await this.updateInstallStatuses(auth.id, { connectorActivationStatus: 'skipped_missing_connector_id', lastError: reason });
            return { attempted: false, success: false, skipped: true, reason };
        }
        if (!this.lineId) {
            const reason = 'BITRIX_OPENLINE_LINE_ID is missing';
            this.logger.log('Open Lines install/auth is ready, but connector activation skipped because line id is missing');
            await this.updateInstallStatuses(auth.id, { connectorActivationStatus: 'skipped_missing_line_id', lastError: reason });
            return { attempted: false, success: false, skipped: true, reason };
        }
        const response = await this.callBitrixAppMethod(auth, 'imconnector.activate', {
            CONNECTOR: this.connectorId,
            LINE: this.lineId,
            ACTIVE: true,
        });
        if (!response.ok) {
            const reason = response.error || 'imconnector.activate failed';
            this.logger.warn(`Open Lines connector activation failed: ${reason}`);
            await this.updateInstallStatuses(auth.id, { lineId: this.lineId, connectorActivationStatus: 'failed', lastError: reason });
            return { attempted: true, success: false, skipped: false, reason, response: response.data };
        }
        this.logger.log(`Open Lines connector activation succeeded for connectorId=${this.connectorId} lineId=${this.lineId}`);
        await this.updateInstallStatuses(auth.id, {
            connectorId: this.connectorId,
            lineId: this.lineId,
            connectorActivatedAt: new Date(),
            connectorActivationStatus: 'activated',
            lastError: null,
        });
        return { attempted: true, success: true, skipped: false, response: response.data };
    }
    async ensureConnectorReadyAfterInstall(auth) {
        const registered = await this.registerConnector(auth);
        if (!registered.success)
            return { persisted: true, registered, activated: null };
        const activated = await this.activateConnector(auth);
        return { persisted: true, registered, activated };
    }
    getAppEventFoundation() {
        if (!this.publicBaseUrl)
            return null;
        return {
            messageAddHandler: `${this.publicBaseUrl}/api/whatsapp/bitrix/openline/app-event`,
            deliveryHandler: `${this.publicBaseUrl}/api/whatsapp/bitrix/openline/delivery`,
            note: 'Use this as the base for future OnImConnectorMessageAdd / delivery callbacks wiring.',
        };
    }
    async persistInstallAuth(auth, rawPayload) {
        if (!auth.domain || !auth.memberId || !auth.accessToken || !auth.refreshToken) {
            this.logger.warn(`Bitrix install auth persistence skipped: incomplete auth payload domain=${auth.domain || 'n/a'} memberId=${auth.memberId || 'n/a'}`);
            return null;
        }
        if (!this.prisma.connected) {
            this.logger.warn('Bitrix install auth persistence skipped: database is unavailable');
            return null;
        }
        try {
            const record = await this.prisma.bitrixAppInstallation.upsert({
                where: { domain: auth.domain },
                create: {
                    domain: auth.domain,
                    memberId: auth.memberId,
                    accessToken: auth.accessToken,
                    refreshToken: auth.refreshToken,
                    applicationToken: auth.applicationToken,
                    expiresIn: auth.expiresIn,
                    scope: auth.scope,
                    status: auth.status,
                    clientEndpoint: auth.clientEndpoint,
                    serverEndpoint: auth.serverEndpoint,
                    connectorId: this.connectorId || null,
                    lineId: this.lineId || null,
                    rawPayload: rawPayload,
                },
                update: {
                    memberId: auth.memberId,
                    accessToken: auth.accessToken,
                    refreshToken: auth.refreshToken,
                    applicationToken: auth.applicationToken,
                    expiresIn: auth.expiresIn,
                    scope: auth.scope,
                    status: auth.status,
                    clientEndpoint: auth.clientEndpoint,
                    serverEndpoint: auth.serverEndpoint,
                    connectorId: this.connectorId || null,
                    lineId: this.lineId || null,
                    rawPayload: rawPayload,
                    installedAt: new Date(),
                    lastError: null,
                },
            });
            return this.mapInstallRecord(record);
        }
        catch (error) {
            this.logger.error(`Failed to persist Bitrix install auth for domain=${auth.domain} memberId=${auth.memberId}: ${error?.message || error}`, error?.stack);
            return null;
        }
    }
    async getLatestInstallAuth() {
        if (!this.prisma.connected)
            return null;
        try {
            const record = await this.prisma.bitrixAppInstallation.findFirst({ orderBy: { updatedAt: 'desc' } });
            return record ? this.mapInstallRecord(record) : null;
        }
        catch (error) {
            this.logger.warn(`Failed to load persisted Bitrix install auth: ${error?.message || error}`);
            return null;
        }
    }
    async updateInstallStatuses(installationId, input) {
        if (!this.prisma.connected)
            return null;
        try {
            return await this.prisma.bitrixAppInstallation.update({
                where: { id: installationId },
                data: {
                    connectorId: input.connectorId,
                    lineId: input.lineId,
                    connectorRegisteredAt: input.connectorRegisteredAt,
                    connectorRegistrationStatus: input.connectorRegistrationStatus,
                    connectorActivatedAt: input.connectorActivatedAt,
                    connectorActivationStatus: input.connectorActivationStatus,
                    lastError: input.lastError,
                },
            });
        }
        catch (error) {
            this.logger.warn(`Failed to update Bitrix install auth status for installation=${installationId}: ${error?.message || error}`);
            return null;
        }
    }
    async callBitrixAppMethod(auth, method, payload) {
        const baseEndpoint = (auth.serverEndpoint || auth.clientEndpoint || '').replace(/\/+$/, '');
        if (!baseEndpoint)
            return { ok: false, error: 'server_endpoint/client_endpoint is missing in persisted install auth' };
        if (!auth.accessToken)
            return { ok: false, error: 'access token is missing in persisted install auth' };
        try {
            const response = await axios_1.default.post(`${baseEndpoint}/${method}.json`, { auth: auth.accessToken, ...payload }, { timeout: 15000 });
            if (response.data?.error) {
                return {
                    ok: false,
                    data: response.data,
                    error: `${response.data.error}: ${response.data.error_description || 'Bitrix returned an error'}`,
                };
            }
            return { ok: true, data: response.data };
        }
        catch (error) {
            const data = error?.response?.data;
            return { ok: false, data, error: data?.error_description || data?.error || error?.message || 'Bitrix REST call failed' };
        }
    }
    buildRegisterPayload() {
        const handlers = this.getAppEventFoundation();
        const base = this.publicBaseUrl;
        return {
            CONNECTOR: this.connectorId,
            NAME: this.connectorName,
            URL_IM: handlers?.messageAddHandler || `${base}/api/whatsapp/bitrix/openline/app-event`,
            URL_IM_MESSAGE_ADD: handlers?.messageAddHandler || `${base}/api/whatsapp/bitrix/openline/app-event`,
            URL_IM_MESSAGE_UPDATE: `${base}/api/whatsapp/bitrix/openline/app-event`,
            URL_IM_MESSAGE_DELETE: `${base}/api/whatsapp/bitrix/openline/app-event`,
            URL_STATUS_DELIVERY: handlers?.deliveryHandler || `${base}/api/whatsapp/bitrix/openline/delivery`,
        };
    }
    mapInstallRecord(record) {
        return {
            id: record.id,
            domain: record.domain,
            memberId: record.memberId,
            accessToken: record.accessToken,
            refreshToken: record.refreshToken,
            applicationToken: record.applicationToken,
            expiresIn: record.expiresIn,
            scope: record.scope,
            status: record.status,
            clientEndpoint: record.clientEndpoint,
            serverEndpoint: record.serverEndpoint,
            connectorId: record.connectorId,
            lineId: record.lineId,
            connectorRegisteredAt: record.connectorRegisteredAt?.toISOString() || null,
            connectorRegistrationStatus: record.connectorRegistrationStatus,
            connectorActivatedAt: record.connectorActivatedAt?.toISOString() || null,
            connectorActivationStatus: record.connectorActivationStatus,
            lastError: record.lastError,
            installedAt: record.installedAt.toISOString(),
            updatedAt: record.updatedAt.toISOString(),
        };
    }
    extractInstallAuth(payload) {
        const authNode = this.pickObject(payload, ['auth', 'AUTH']);
        const accessToken = this.pickStringFromObject(authNode, ['access_token', 'ACCESS_TOKEN']) ||
            this.pickString(payload, ['AUTH_ID', 'auth.access_token', 'AUTH.access_token', 'auth[access_token]', 'AUTH[access_token]', 'access_token']);
        const refreshToken = this.pickStringFromObject(authNode, ['refresh_token', 'REFRESH_TOKEN']) ||
            this.pickString(payload, ['REFRESH_ID', 'auth.refresh_token', 'AUTH.refresh_token', 'auth[refresh_token]', 'AUTH[refresh_token]', 'refresh_token']);
        const expiresIn = this.pickNumberFromObject(authNode, ['expires_in', 'EXPIRES_IN']) ||
            this.pickNumber(payload, ['AUTH_EXPIRES', 'auth.expires_in', 'AUTH.expires_in', 'auth[expires_in]', 'AUTH[expires_in]', 'expires_in']);
        const scope = this.pickStringFromObject(authNode, ['scope', 'SCOPE']) ||
            this.pickString(payload, ['auth.scope', 'AUTH.scope', 'auth[scope]', 'AUTH[scope]', 'scope']);
        const domain = this.pickStringFromObject(authNode, ['domain', 'DOMAIN']) ||
            this.pickString(payload, ['DOMAIN', 'auth.domain', 'AUTH.domain', 'auth[domain]', 'AUTH[domain]', 'domain']);
        const memberId = this.pickStringFromObject(authNode, ['member_id', 'MEMBER_ID']) ||
            this.pickString(payload, ['member_id', 'MEMBER_ID', 'auth.member_id', 'AUTH.member_id', 'auth[member_id]', 'AUTH[member_id]']);
        const applicationToken = this.pickStringFromObject(authNode, ['application_token', 'APPLICATION_TOKEN']) ||
            this.pickString(payload, ['APP_SID', 'application_token', 'auth.application_token', 'AUTH.application_token', 'auth[application_token]', 'AUTH[application_token]']);
        const status = this.pickStringFromObject(authNode, ['status', 'STATUS']) ||
            this.pickString(payload, ['status', 'AUTH_STATUS', 'auth.status', 'AUTH.status']);
        const clientEndpoint = this.pickStringFromObject(authNode, ['client_endpoint', 'CLIENT_ENDPOINT']) ||
            this.pickString(payload, ['client_endpoint', 'CLIENT_ENDPOINT', 'auth.client_endpoint', 'AUTH.client_endpoint', 'auth[client_endpoint]', 'AUTH[client_endpoint]']);
        const serverEndpoint = this.pickStringFromObject(authNode, ['server_endpoint', 'SERVER_ENDPOINT']) ||
            this.pickString(payload, ['server_endpoint', 'SERVER_ENDPOINT', 'auth.server_endpoint', 'AUTH.server_endpoint', 'auth[server_endpoint]', 'AUTH[server_endpoint]']);
        return {
            accessToken,
            refreshToken,
            expiresIn,
            scope,
            domain,
            memberId,
            applicationToken,
            status,
            clientEndpoint,
            serverEndpoint,
        };
    }
    normalizePayload(value) {
        const normalized = this.deepCloneObject(value);
        for (const [rawKey, rawValue] of Object.entries(value || {})) {
            const key = String(rawKey || '').trim();
            if (!key)
                continue;
            const bracketPath = this.parseBracketKey(key);
            if (bracketPath.length > 1)
                this.assignPath(normalized, bracketPath, rawValue);
        }
        return normalized;
    }
    deepCloneObject(value) {
        const clone = {};
        for (const [key, entry] of Object.entries(value || {})) {
            clone[key] = entry && typeof entry === 'object' && !Array.isArray(entry)
                ? this.deepCloneObject(entry)
                : entry;
        }
        return clone;
    }
    parseBracketKey(key) {
        const matches = key.match(/[^[\].]+/g);
        return matches ? matches.filter(Boolean) : [key];
    }
    assignPath(target, path, value) {
        let cursor = target;
        for (let index = 0; index < path.length; index += 1) {
            const segment = path[index];
            const isLeaf = index === path.length - 1;
            if (isLeaf) {
                cursor[segment] = value;
                return;
            }
            const existing = cursor[segment];
            if (!existing || typeof existing !== 'object' || Array.isArray(existing))
                cursor[segment] = {};
            cursor = cursor[segment];
        }
    }
    pickObject(payload, keys) {
        for (const key of keys) {
            const value = payload[key];
            if (value && typeof value === 'object' && !Array.isArray(value))
                return value;
        }
        return null;
    }
    pickString(payload, paths) {
        for (const path of paths) {
            const normalized = this.asNonEmptyString(this.readPath(payload, path));
            if (normalized)
                return normalized;
        }
        return null;
    }
    pickNumber(payload, paths) {
        for (const path of paths) {
            const normalized = this.asNumber(this.readPath(payload, path));
            if (normalized !== null)
                return normalized;
        }
        return null;
    }
    pickStringFromObject(payload, keys) {
        return payload ? this.pickString(payload, keys) : null;
    }
    pickNumberFromObject(payload, keys) {
        return payload ? this.pickNumber(payload, keys) : null;
    }
    readPath(payload, path) {
        if (path in payload)
            return payload[path];
        const segments = path.split('.').filter(Boolean);
        let cursor = payload;
        for (const segment of segments) {
            if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor))
                return undefined;
            cursor = cursor[segment];
        }
        return cursor;
    }
    asNonEmptyString(value) {
        if (typeof value === 'string') {
            const trimmed = value.trim();
            return trimmed ? trimmed : null;
        }
        if (typeof value === 'number' || typeof value === 'boolean')
            return String(value);
        return null;
    }
    asNumber(value) {
        if (typeof value === 'number' && Number.isFinite(value))
            return value;
        if (typeof value === 'string' && value.trim()) {
            const parsed = Number(value.trim());
            return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
    }
    maskSecret(value) {
        if (!value)
            return null;
        if (value.length <= 8)
            return `${value.slice(0, 2)}***${value.slice(-1)}`;
        return `${value.slice(0, 4)}***${value.slice(-4)}`;
    }
};
exports.BitrixOpenLinesService = BitrixOpenLinesService;
exports.BitrixOpenLinesService = BitrixOpenLinesService = BitrixOpenLinesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [bitrix_service_1.BitrixService,
        prisma_service_1.PrismaService])
], BitrixOpenLinesService);
//# sourceMappingURL=bitrix-openlines.service.js.map