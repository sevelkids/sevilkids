export interface DentistAuthResponse {
  token: string;
  expires_at?: string;
}

export interface DentistPaginatedResponse<T> {
  data: T[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}

export interface DentistBranch {
  id: number;
  title: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface DentistDoctorProfession {
  id: number;
  title: string;
}

export interface DentistDoctorBranch {
  id: number;
  title: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface DentistDoctor {
  id: number;
  fname: string;
  lname: string;
  mname?: string | null;
  phone?: string | null;
  phone_2?: string | null;
  email?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  color?: string | null;
  deleted?: boolean;
  created_at?: string;
  updated_at?: string;
  branches: DentistDoctorBranch[];
  professions: DentistDoctorProfession[];
}

export interface DentistPatient {
  id: number;
  fname: string;
  lname: string;
  mname?: string | null;
  phone?: string | null;
  phone_2?: string | null;
  email?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface DentistCreatePatientPayload {
  branch_id: number;
  fname: string;
  lname: string;
  mname?: string;
  phone?: string;
  phone_2?: string;
  email?: string;
  gender?: string;
  date_of_birth?: string;
}

export interface DentistScheduleItem {
  doctor_id: number;
  chair_id?: number | null;
  branch_id: number;
  day: string;
  time_from: string;
  time_to: string;
  minutes: number;
}

export interface DentistVisit {
  id: number;
  patient_id: number;
  doctor_id: number;
  branch_id: number;
  start: string;
  end: string;
  description?: string | null;
  status?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface DentistCreateVisitPayload {
  branch_id: number;
  patient_id: number;
  doctor_id: number;
  start: string;
  end: string;
  description?: string;
}
