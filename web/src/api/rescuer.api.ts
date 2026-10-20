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
