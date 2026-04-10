"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppModule = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const dentist_module_1 = require("../integrations/dentist/dentist.module");
const bitrix_module_1 = require("../integrations/bitrix/bitrix.module");
const whatsapp_service_1 = require("./whatsapp.service");
const whatsapp_session_1 = require("./whatsapp.session");
const whatsapp_messages_1 = require("./whatsapp.messages");
const gemini_nlu_service_1 = require("../nlu/gemini-nlu.service");
const whatsapp_automation_service_1 = require("./whatsapp.automation.service");
const whatsapp_controller_1 = require("./whatsapp.controller");
const booking_draft_service_1 = require("./booking-draft.service");
const outbound_router_service_1 = require("./outbound-router.service");
const whatsapp_client_service_1 = require("./whatsapp.client.service");
const whatsapp_script_catalog_1 = require("./whatsapp.script-catalog");
let WhatsAppModule = class WhatsAppModule {
};
exports.WhatsAppModule = WhatsAppModule;
exports.WhatsAppModule = WhatsAppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            schedule_1.ScheduleModule.forRoot(),
            dentist_module_1.DentistModule,
            bitrix_module_1.BitrixModule,
        ],
        controllers: [whatsapp_controller_1.WhatsAppController],
        providers: [
            whatsapp_service_1.WhatsAppService,
            whatsapp_session_1.WhatsAppSessionService,
            whatsapp_messages_1.WhatsAppMessagesService,
            whatsapp_script_catalog_1.WhatsAppScriptCatalog,
            booking_draft_service_1.BookingDraftService,
            outbound_router_service_1.OutboundRouterService,
            whatsapp_client_service_1.WhatsAppClientService,
            gemini_nlu_service_1.GeminiNluService,
            whatsapp_automation_service_1.WhatsAppAutomationService,
        ],
        exports: [whatsapp_service_1.WhatsAppService, outbound_router_service_1.OutboundRouterService, whatsapp_session_1.WhatsAppSessionService],
    })
], WhatsAppModule);
//# sourceMappingURL=whatsapp.module.js.map