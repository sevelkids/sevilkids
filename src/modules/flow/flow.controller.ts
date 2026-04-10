import { Body, Controller, Post } from '@nestjs/common';
import { FlowService } from './flow.service';

@Controller('flow')
export class FlowController {
  constructor(private readonly flowService: FlowService) {}

  @Post('incoming-message')
  async incomingMessage(
      @Body()
      body: {
        phone: string;
        message: string;
        firstName?: string;
        lastName?: string;
        middleName?: string;
        branchId?: number;
      },
  ) {
    return this.flowService.processIncomingMessage(body);
  }

  @Post('visit-created')
  async visitCreated(
      @Body()
      body: {
        patientId: number;
        doctorId: number;
        branchId: number;
        start: string;
        end: string;
        description?: string;
      },
  ) {
    return this.flowService.processSuccessfulVisitCreation(body);
  }

  @Post('patient-arrived')
  async patientArrived(
      @Body()
      body: {
        patientId: number;
        visitId: number;
      },
  ) {
    return this.flowService.processPatientArrived(body);
  }

  @Post('patient-no-show')
  async patientNoShow(
      @Body()
      body: {
        patientId: number;
        visitId: number;
      },
  ) {
    return this.flowService.processPatientNoShow(body);
  }

  @Post('visit-cancelled')
  async visitCancelled(
      @Body()
      body: {
        patientId: number;
        visitId: number;
        reason?: string;
      },
  ) {
    return this.flowService.processVisitCancelled(body);
  }

  @Post('visit-rescheduled')
  async visitRescheduled(
      @Body()
      body: {
        patientId: number;
        visitId: number;
        doctorId: number;
        branchId: number;
        start: string;
        end: string;
        description?: string;
        reason?: string;
      },
  ) {
    return this.flowService.processVisitRescheduled(body);
  }

  @Post('send-visit-reminder')
  async sendVisitReminder(
      @Body()
      body: {
        patientId: number;
        visitId: number;
        phone?: string;
      },
  ) {
    return this.flowService.processSendVisitReminder(body);
  }

  @Post('sync-known-visit')
  async syncKnownVisit(
      @Body()
      body: {
        visitId: number;
        patientId?: number;
      },
  ) {
    return this.flowService.processSyncKnownVisit(body);
  }
}