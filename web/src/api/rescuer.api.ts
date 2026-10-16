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

export async function fetchVehicles(): Promise<{ success: boolean; data: VehicleItem[] }> {
  return fetchWithAuth('/vehicles', { method: 'GET' });
}

export async function fetchRescueTeams(): Promise<{ success: boolean; data: RescueTeamItem[] }> {
  return fetchWithAuth('/rescue-teams', { method: 'GET' });
}
