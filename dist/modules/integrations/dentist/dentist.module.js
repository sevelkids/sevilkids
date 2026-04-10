"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DentistModule = void 0;
const common_1 = require("@nestjs/common");
const dentist_client_1 = require("./dentist.client");
const dentist_controller_1 = require("./dentist.controller");
const dentist_service_1 = require("./dentist.service");
let DentistModule = class DentistModule {
};
exports.DentistModule = DentistModule;
exports.DentistModule = DentistModule = __decorate([
    (0, common_1.Module)({
        controllers: [dentist_controller_1.DentistController],
        providers: [dentist_client_1.DentistClient, dentist_service_1.DentistService],
        exports: [dentist_client_1.DentistClient, dentist_service_1.DentistService],
    })
], DentistModule);
//# sourceMappingURL=dentist.module.js.map