import { Body, Controller, Get, Query, Post } from '@nestjs/common';
import { DentistService } from './dentist.service';

@Controller('dentist')
export class DentistController {
  constructor(private readonly dentistService: DentistService) {}

  @Get('auth')
  async auth() {
    return this.dentistService.authorize();
  }

  @Get('branches')
  async branches() {
    return this.dentistService.getBranches();
  }

  @Get('doctors')
  async doctors(@Query() query: Record<string, string>) {
    return this.dentistService.getDoctors(query);
  }

  @Get('patients/search')
  async searchPatients(@Query('search') search: string) {
    return this.dentistService.searchPatients(search);
  }

  @Get('patients/find-by-phone')
  async findByPhone(@Query('phone') phone: string) {
    return this.dentistService.findPatientByPhone(phone);
  }

  @Post('patients')
  async createPatient(
    @Body()
    body: {
      firstName: string;
      lastName?: string;
      middleName?: string;
      phone: string;
      phone2?: string;
      email?: string;
      gender?: string;
      dateOfBirth?: string;
      branchId?: number;
    },
  ) {
    return this.dentistService.createPatient(body);
  }

  @Get('schedule')
  async getSchedule(
    @Query('doctorId') doctorId: string,
    @Query('branchId') branchId: string,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
  ) {
    return this.dentistService.getSchedule({
      doctorId: Number(doctorId),
      branchId: Number(branchId),
      dateFrom,
      dateTo,
    });
  }

  @Get('visits')
  async getVisits(
    @Query('doctorId') doctorId?: string,
    @Query('patientId') patientId?: string,
    @Query('branchId') branchId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.dentistService.getVisits({
      doctorId: doctorId ? Number(doctorId) : undefined,
      patientId: patientId ? Number(patientId) : undefined,
      branchId: branchId ? Number(branchId) : undefined,
      dateFrom,
      dateTo,
    });
  }

  @Post('visits')
  async createVisit(
    @Body()
    body: {
      branchId: number;
      patientId: number;
      doctorId: number;
      start: string;
      end: string;
      description?: string;
    },
  ) {
    return this.dentistService.createVisit(body);
  }

  @Get('available-slots')
  async getAvailableSlots(
    @Query('doctorId') doctorId: string,
    @Query('branchId') branchId: string,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @Query('slotMinutes') slotMinutes?: string,
  ) {
    return this.dentistService.getAvailableSlots({
      doctorId: Number(doctorId),
      branchId: Number(branchId),
      dateFrom,
      dateTo,
      slotMinutes: slotMinutes ? Number(slotMinutes) : 30,
    });
  }
}