"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlowModule = void 0;
const common_1 = require("@nestjs/common");
const flow_controller_1 = require("./flow.controller");
const flow_service_1 = require("./flow.service");
const patient_sync_service_1 = require("./patient-sync.service");
const dentist_module_1 = require("../integrations/dentist/dentist.module");
const bitrix_module_1 = require("../integrations/bitrix/bitrix.module");
const doctors_module_1 = require("../doctors/doctors.module");
let FlowModule = class FlowModule {
};
exports.FlowModule = FlowModule;
exports.FlowModule = FlowModule = __decorate([
    (0, common_1.Module)({
        imports: [dentist_module_1.DentistModule, bitrix_module_1.BitrixModule, doctors_module_1.DoctorsModule],
        controllers: [flow_controller_1.FlowController],
        providers: [flow_service_1.FlowService, patient_sync_service_1.PatientSyncService],
        exports: [flow_service_1.FlowService],
    })
], FlowModule);
//# sourceMappingURL=flow.module.js.map