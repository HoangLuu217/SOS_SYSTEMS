import { fetchWithAuth } from './client';
import type { SosRequestItem } from '@/types/dashboard';

export async function fetchSosRequests(params: Record<string, string> = {}): Promise<{ success: boolean; data: SosRequestItem[] }> {
  const query = new URLSearchParams(params).toString();
  const endpoint = query ? `/sos?${query}` : '/sos';
  return fetchWithAuth(endpoint, { method: 'GET' });
}

export async function createSosRequest(payload: {
  citizenId?: string;
  location: { type: 'Point'; coordinates: [number, number] };
  areaId: string;
  address: string;
  emergencyType: string;
  priority: string;
  people: number;
  description?: string;
}): Promise<{ success: boolean; data: SosRequestItem }> {
  return fetchWithAuth('/sos', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function verifySosRequest(
  sosId: string,
  payload: { priority: string; status: string }
): Promise<{ success: boolean; data: SosRequestItem }> {
  return fetchWithAuth(`/sos/${sosId}/verify`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function completeSosRequest(sosId: string): Promise<{ success: boolean; data: SosRequestItem }> {
  return fetchWithAuth(`/sos/${sosId}/complete`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function assignSosApi(sosId: string, payload: {
  authorityOrganizationId?: string;
  rescueTeamId: string;
  rescuerId: string;
  vehicleId?: string;
  note?: string;
  supplies?: Array<{
    supplyId: string;
    name: string;
    quantity: number;
    unit?: string;
  }>;
}): Promise<{ success: boolean; data: any }> {
  return fetchWithAuth(`/sos/${sosId}/assign`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateAssignmentStatusApi(assignmentId: string, status: string): Promise<{ success: boolean; data: any }> {
  return fetchWithAuth(`/assignments/${assignmentId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function cancelAssignmentApi(assignmentId: string, reason: string): Promise<{ success: boolean; data: any }> {
  return fetchWithAuth(`/assignments/${assignmentId}/cancel`, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
  });
}

export async function reassignMissionApi(assignmentId: string, payload: {
  rescueTeamId: string;
  rescuerId: string;
  vehicleId?: string;
  reason?: string;
}): Promise<{ success: boolean; data: any }> {
  return fetchWithAuth(`/assignments/${assignmentId}/reassign`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
