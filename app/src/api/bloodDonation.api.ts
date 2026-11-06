import { apiClient, ApiClient } from './client';
import { ApiResponse } from '../types';

export interface BloodDonationEventStats {
  totalNotified: number;
  confirmedCount: number;
  declinedCount: number;
  completedCount: number;
}

export interface BloodDonationRegistrationItem {
  _id: string;
  userId: string;
  eventId?: string | null;
  registrationType: 'PRE_REGISTRATION' | 'EVENT_REGISTRATION';
  fullName: string;
  phone: string;
  bloodType: string;
  weightKg?: number | null;
  lastDonationDate?: string;
  healthNote?: string;
  preferredTimeSlot?: string;
  note?: string;
  areaId?: string | null;
  areaName?: string;
  provinceId?: string | null;
  provinceName?: string;
  address?: string;
  status: 'PENDING' | 'CONFIRMED' | 'DECLINED' | 'COMPLETED' | 'CANCELLED';
  respondedAt: string;
  createdAt: string;
}

export interface BloodDonationEventItem {
  _id: string;
  title: string;
  description?: string;
  locationName: string;
  address: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  neededBloodTypes: string[];
  targetDonors: number;
  organizerName: string;
  contactPhone?: string;
  requirements?: string;
  urgencyLevel: 'NORMAL' | 'HIGH' | 'CRITICAL';
  scope: 'ALL' | 'PROVINCE' | 'WARD';
  areaId?: string | null;
  areaName?: string;
  provinceId?: string | null;
  provinceName?: string;
  status: 'ACTIVE' | 'CLOSED' | 'CANCELLED';
  stats: BloodDonationEventStats;
  myResponse?: BloodDonationRegistrationItem | null;
  createdAt: string;
}

export interface ProvinceAreaItem {
  _id: string;
  name: string;
  code?: string;
}

export interface RegisterBloodDonationPayload {
  fullName?: string;
  phone?: string;
  bloodType?: string;
  weightKg?: number;
  lastDonationDate?: string;
  healthNote?: string;
  note?: string;
  provinceId?: string;
  provinceName?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
}

export interface RespondBloodEventPayload {
  status: 'CONFIRMED' | 'DECLINED' | 'CANCELLED';
  fullName?: string;
  phone?: string;
  bloodType?: string;
  weightKg?: number;
  preferredTimeSlot?: string;
  healthNote?: string;
  note?: string;
  address?: string;
}

export class BloodDonationApi {
  constructor(private client: ApiClient = apiClient) {}

  async getMyStatus(): Promise<
    ApiResponse<{
      myPreRegistration: BloodDonationRegistrationItem | null;
      activeEvents: BloodDonationEventItem[];
      unrespondedCount: number;
      provinces?: ProvinceAreaItem[];
    }>
  > {
    return await this.client.get('/blood-donations/me');
  }

  async getProvinces(): Promise<ApiResponse<ProvinceAreaItem[]>> {
    return await this.client.get('/administrative-areas?type=PROVINCE');
  }

  async registerPending(
    payload: RegisterBloodDonationPayload
  ): Promise<ApiResponse<BloodDonationRegistrationItem>> {
    return await this.client.post('/blood-donations/register', payload);
  }

  async cancelPreRegistration(): Promise<ApiResponse<BloodDonationRegistrationItem>> {
    return await this.client.patch('/blood-donations/register/cancel', {});
  }

  async getEventDetail(
    eventId: string
  ): Promise<
    ApiResponse<{
      event: BloodDonationEventItem;
      myResponse: BloodDonationRegistrationItem | null;
    }>
  > {
    return await this.client.get(`/blood-donations/events/${eventId}`);
  }

  async respondToEvent(
    eventId: string,
    payload: RespondBloodEventPayload
  ): Promise<
    ApiResponse<{
      registration: BloodDonationRegistrationItem;
      event: BloodDonationEventItem;
    }>
  > {
    return await this.client.post(`/blood-donations/events/${eventId}/respond`, payload);
  }
}

export const bloodDonationApi = new BloodDonationApi();

