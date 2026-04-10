import { Module } from '@nestjs/common';
import { FlowController } from './flow.controller';
import { FlowService } from './flow.service';
import { PatientSyncService } from './patient-sync.service';
import { DentistModule } from '../integrations/dentist/dentist.module';
import { BitrixModule } from '../integrations/bitrix/bitrix.module';
import { DoctorsModule } from '../doctors/doctors.module';

@Module({
  imports: [DentistModule, BitrixModule, DoctorsModule],
  controllers: [FlowController],
  providers: [FlowService, PatientSyncService],
  exports: [FlowService],
})
export class FlowModule {}