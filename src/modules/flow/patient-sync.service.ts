import { Injectable } from '@nestjs/common';
import { BitrixService } from '../integrations/bitrix/bitrix.service';
import { DentistService } from '../integrations/dentist/dentist.service';

@Injectable()
export class PatientSyncService {
    constructor(
        private readonly dentistService: DentistService,
        private readonly bitrixService: BitrixService,
    ) {}

    async ensurePatientEverywhere(input: {
        phone: string;
        message: string;
        firstName?: string;
        lastName?: string;
        middleName?: string;
        branchId?: number;
    }) {
        let patient = await this.dentistService.findPatientByPhone(input.phone);
        let patientCreated = false;

        if (!patient) {
            patient = await this.dentistService.createPatient({
                firstName: input.firstName || 'Новый',
                lastName: input.lastName || 'Пациент',
                middleName: input.middleName,
                phone: input.phone,
                branchId: input.branchId,
            });

            patientCreated = true;
        }

        const bitrix = await this.bitrixService.ensureContactAndRequestDeal({
            phone: input.phone,
            message: input.message,
            firstName: patient.firstName || input.firstName,
            lastName: patient.lastName || input.lastName,
            middleName: patient.middleName || input.middleName,
            fullName: patient.fullName,
            dentistPlusPatientId: patient.id,
        });

        return {
            patient,
            patientCreated,
            bitrix,
        };
    }
}