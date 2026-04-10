import { Injectable } from '@nestjs/common';
import {
    DOCTORS_DATA,
    DoctorProfile,
    ServiceCode,
} from './doctors.data';

@Injectable()
export class DoctorsDirectoryService {
    private readonly doctors = DOCTORS_DATA;

    getAll(): DoctorProfile[] {
        return this.doctors;
    }

    getByDoctorId(doctorId: number): DoctorProfile | undefined {
        return this.doctors.find((doctor) => doctor.doctorId === doctorId);
    }

    getDoctorName(doctorId: number): string {
        return this.getByDoctorId(doctorId)?.fullName ?? `Врач #${doctorId}`;
    }

    getDoctorsByService(serviceCode: ServiceCode): DoctorProfile[] {
        return this.doctors.filter((doctor) => Boolean(doctor.services[serviceCode]));
    }

    doctorProvidesService(doctorId: number, serviceCode: ServiceCode): boolean {
        const doctor = this.getByDoctorId(doctorId);
        return Boolean(doctor?.services?.[serviceCode]);
    }

    getServiceDuration(doctorId: number, serviceCode: ServiceCode): number | null {
        const doctor = this.getByDoctorId(doctorId);
        return doctor?.services?.[serviceCode]?.durationMinutes ?? null;
    }
}