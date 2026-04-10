import { Module } from '@nestjs/common';
import { DentistClient } from './dentist.client';
import { DentistController } from './dentist.controller';
import { DentistService } from './dentist.service';

@Module({
    controllers: [DentistController],
    providers: [DentistClient, DentistService],
    exports: [DentistClient, DentistService],
})
export class DentistModule {}