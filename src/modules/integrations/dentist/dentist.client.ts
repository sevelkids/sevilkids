import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { dentistConfig } from '../../../config/dentist.config';
import {
  DentistAuthResponse,
  DentistBranch,
  DentistCreatePatientPayload,
  DentistCreateVisitPayload,
  DentistDoctor,
  DentistPaginatedResponse,
  DentistPatient,
  DentistScheduleItem,
  DentistVisit,
} from './dentist.types';

@Injectable()
export class DentistClient {
  private readonly logger = new Logger(DentistClient.name);
  private readonly http: AxiosInstance;
  private accessToken: string | null = null;

  constructor() {
    this.http = axios.create({
      baseURL: dentistConfig.baseUrl,
      timeout: 20000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async authorize(): Promise<string> {
    try {
      const { data } = await this.http.post<DentistAuthResponse>('/auth', {
        login: dentistConfig.login,
        pass: dentistConfig.password,
      });

      if (!data?.token) {
        throw new Error('Dentist API did not return token');
      }

      this.accessToken = data.token;
      return this.accessToken;
    } catch (error: any) {
      this.logger.error('Dentist authorize failed');

      if (error?.response) {
        this.logger.error(`Status: ${error.response.status}`);
        this.logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
      }

      throw new BadGatewayException('Failed to authorize in Dentist Plus');
    }
  }

  private async ensureToken(): Promise<string> {
    if (this.accessToken) {
      return this.accessToken;
    }

    return this.authorize();
  }

  private async request<T>(
      method: 'GET' | 'POST' | 'PUT',
      url: string,
      options?: {
        data?: unknown;
        params?: Record<string, unknown>;
      },
      retry = true,
  ): Promise<T> {
    const token = await this.ensureToken();

    try {
      const response = await this.http.request<T>({
        method,
        url,
        data: options?.data,
        params: options?.params,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return response.data;
    } catch (error: any) {
      const status = error?.response?.status;

      if ((status === 401 || status === 403) && retry) {
        this.accessToken = null;
        await this.authorize();
        return this.request<T>(method, url, options, false);
      }

      this.logger.error(`Dentist request failed: ${method} ${url}`);

      if (error?.response) {
        this.logger.error(`Status: ${error.response.status}`);
        this.logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
      }

      if (error?.config) {
        this.logger.error(`Request url: ${error.config.baseURL}${error.config.url}`);
        this.logger.error(`Request params: ${JSON.stringify(error.config.params)}`);
        this.logger.error(`Request data: ${JSON.stringify(error.config.data)}`);
      }

      throw new BadGatewayException(`Dentist request failed: ${url}`);
    }
  }

  async getBranches(): Promise<DentistPaginatedResponse<DentistBranch>> {
    return this.request<DentistPaginatedResponse<DentistBranch>>('GET', '/branches');
  }

  async getDoctors(
      params?: Record<string, unknown>,
  ): Promise<DentistPaginatedResponse<DentistDoctor>> {
    return this.request<DentistPaginatedResponse<DentistDoctor>>('GET', '/doctors', {
      params,
    });
  }

  async searchPatients(
      search: string,
  ): Promise<DentistPaginatedResponse<DentistPatient>> {
    return this.request<DentistPaginatedResponse<DentistPatient>>('GET', '/patients', {
      params: { search },
    });
  }

  async createPatient(
      payload: DentistCreatePatientPayload,
  ): Promise<DentistPatient> {
    return this.request<DentistPatient>('POST', '/patients', {
      data: payload,
    });
  }

  async getSchedule(params: {
    doctor_id: number;
    branch_id: number;
    date_from: string;
    date_to: string;
  }): Promise<DentistScheduleItem[]> {
    return this.request<DentistScheduleItem[]>('GET', '/schedule', {
      params,
    });
  }

  async getVisits(params: {
    doctor_id?: number;
    patient_id?: number;
    branch_id?: number;
    date_from?: string;
    date_to?: string;
    ids?: string;
    with_deleted?: string | number;
    detailed?: string | number;
  }): Promise<DentistPaginatedResponse<DentistVisit>> {
    const firstPage = await this.request<DentistPaginatedResponse<DentistVisit>>(
        'GET',
        '/visits',
        { params },
    );

    const allData = [...firstPage.data];
    const lastPage = firstPage.meta?.last_page ?? 1;

    if (lastPage <= 1) {
      return {
        ...firstPage,
        data: allData,
      };
    }

    for (let page = 2; page <= lastPage; page++) {
      const nextPage = await this.request<DentistPaginatedResponse<DentistVisit>>(
          'GET',
          '/visits',
          {
            params: {
              ...params,
              page,
            },
          },
      );

      allData.push(...nextPage.data);
    }

    return {
      ...firstPage,
      data: allData,
      meta: {
        ...firstPage.meta,
        current_page: 1,
        last_page: lastPage,
        total: allData.length,
      },
    };
  }

  async getVisit(visitId: number): Promise<DentistVisit> {
    return this.request<DentistVisit>('GET', `/visits/${visitId}`);
  }

  async createVisit(
      payload: DentistCreateVisitPayload,
  ): Promise<DentistVisit> {
    return this.request<DentistVisit>('POST', '/visits', {
      data: payload,
    });
  }

  async updateVisit(
      visitId: number,
      payload: {
        branch_id: number;
        patient_id: number;
        doctor_id: number;
        start: string;
        end: string;
        description?: string;
        status_id?: number;
      },
  ): Promise<DentistVisit> {
    return this.request<DentistVisit>('PUT', `/visits/${visitId}`, {
      data: payload,
    });
  }

  async cancelVisit(
      visitId: number,
      reason: string,
  ): Promise<boolean> {
    return this.request<boolean>('POST', `/visits/${visitId}/cancel`, {
      data: {
        reason,
      },
    });
  }
}