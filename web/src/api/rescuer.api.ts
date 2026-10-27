import { fetchWithAuth } from './client';
import type { VehicleItem, RescueTeamItem } from '@/types/dashboard';

export async function verifyRescuer(
  userId: string,
  verificationStatus: 'VERIFIED' | 'REJECTED'
): Promise<{ success: boolean }> {
  return fetchWithAuth(`/admin/rescuers/${userId}/verify`, {
    method: 'PATCH',
    body: JSON.stringify({ verificationStatus }),
  });
}

export async function fetchVehicles(query?: Record<string, any>): Promise<{ success: boolean; data: VehicleItem[] }> {
  const params = new URLSearchParams();
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '' && v !== 'ALL') {
        params.append(k, String(v));
      }
    });
  }
  const qs = params.toString() ? `?${params.toString()}` : '';
  return fetchWithAuth(`/vehicles${qs}`, { method: 'GET' });
}

export async function fetchRescueTeams(query?: Record<string, any>): Promise<{ success: boolean; data: RescueTeamItem[] }> {
  const params = new URLSearchParams();
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '' && v !== 'ALL') {
        params.append(k, String(v));
      }
    });
  }
  const qs = params.toString() ? `?${params.toString()}` : '';
  return fetchWithAuth(`/rescue-teams${qs}`, { method: 'GET' });
}

export async function createVehicle(payload: {
  teamId?: string | null;
  type: string;
  plateNumber: string;
  capacity?: number;
  status?: string;
  description?: string;
}): Promise<{ success: boolean; data: VehicleItem; message?: string }> {
  return fetchWithAuth('/vehicles', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateVehicle(
  id: string,
  payload: Partial<{
    teamId: string | null;
    type: string;
    plateNumber: string;
    capacity: number;
    status: string;
    description: string;
  }>
): Promise<{ success: boolean; data: VehicleItem; message?: string }> {
  return fetchWithAuth(`/vehicles/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function updateVehicleStatus(
  id: string,
  status: string
): Promise<{ success: boolean; data: VehicleItem; message?: string }> {
  return fetchWithAuth(`/vehicles/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function deleteVehicle(
  id: string
): Promise<{ success: boolean; message?: string }> {
  return fetchWithAuth(`/vehicles/${id}`, { method: 'DELETE' });
}
