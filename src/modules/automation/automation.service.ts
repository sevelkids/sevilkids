import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  handleNewIncomingMessage(payload: {
    phone: string;
    message: string;
  }) {
    this.logger.log(`New incoming message from ${payload.phone}: ${payload.message}`);

    return {
      action: 'mark_new_request',
      pipeline: 'Заявки и обращения',
      status: 'Новый',
    };
  }

  handleVisitCreated(payload: {
    patientId: number;
    doctorId: number;
    branchId: number;
    start: string;
    end: string;
  }) {
    this.logger.log(`Visit created for patient ${payload.patientId}`);

    return {
      action: 'move_request_status',
      pipeline: 'Заявки и обращения',
      status: 'Записан',
      whatsappMessage: `Вы записаны на прием ${payload.start}.`,
    };
  }

  handlePatientArrived(payload: {
    patientId: number;
    visitId: number;
  }) {
    this.logger.log(`Patient arrived: ${payload.patientId}`);

    return {
      firstPipeline: {
        pipeline: 'Заявки и обращения',
        status: 'Пришел',
      },
      thirdPipeline: {
        pipeline: 'Дошедшие и повторные',
        status: 'Новые',
      },
    };
  }

  handlePatientNoShow(payload: {
    patientId: number;
    visitId: number;
  }) {
    this.logger.log(`Patient no-show: ${payload.patientId}`);

    return {
      pipeline: 'Заявки и обращения',
      status: 'Не пришел',
      whatsappMessage: 'Вы не смогли прийти? Могу предложить новое время записи.',
    };
  }
}
