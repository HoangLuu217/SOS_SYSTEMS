import { fetchWithAuth } from './client';
import type { VehicleItem, RescueTeamItem } from '@/types/dashboard';

export async function verifyRescuer(
  userId: string,
  verificationStatus: 'VERIFIED' | 'REJECTED',
  reason?: string
): Promise<{ success: boolean; data?: any; message?: string }> {
  return fetchWithAuth(`/admin/rescuers/${userId}/verify`, {
    method: 'PATCH',
    body: JSON.stringify({ verificationStatus, reason }),
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

export async function createRescueTeam(payload: {
  name: string;
  type: string;
  leaderId: string;
  areaId?: string;
  authorityId?: string;
  description?: string;
  members?: Array<{ rescuerId: string; role?: string }>;
}): Promise<{ success: boolean; data: RescueTeamItem; message?: string }> {
  return fetchWithAuth('/rescue-teams', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteRescueTeam(
  id: string
): Promise<{ success: boolean; message?: string }> {
  return fetchWithAuth(`/rescue-teams/${id}`, { method: 'DELETE' });
}

export async function updateRescueTeamStatus(
  id: string,
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING'
): Promise<{ success: boolean; data?: any; message?: string }> {
  return fetchWithAuth(`/rescue-teams/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function updateTeamMemberStatus(
  teamId: string,
  rescuerId: string,
  status: 'APPROVED' | 'REJECTED'
): Promise<{ success: boolean; data?: any; message?: string }> {
  return fetchWithAuth(`/rescue-teams/${teamId}/members/${rescuerId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function removeTeamMember(
  teamId: string,
  rescuerId: string
): Promise<{ success: boolean; data?: any; message?: string }> {
  return fetchWithAuth(`/rescue-teams/${teamId}/members/${rescuerId}`, {
    method: 'DELETE',
  });
}

export async function addTeamMember(
  teamId: string,
  rescuerId: string,
  role: 'LEADER' | 'MEMBER' = 'MEMBER'
): Promise<{ success: boolean; data?: any; message?: string }> {
  return fetchWithAuth(`/rescue-teams/${teamId}/members`, {
    method: 'POST',
    body: JSON.stringify({ rescuerId, role }),
  });
}

export async function changeTeamLeader(
  teamId: string,
  newLeaderId: string
): Promise<{ success: boolean; data?: any; message?: string }> {
  return fetchWithAuth(`/rescue-teams/${teamId}/leader`, {
    method: 'PATCH',
    body: JSON.stringify({ leaderId: newLeaderId, newLeaderId }),
  });
}
