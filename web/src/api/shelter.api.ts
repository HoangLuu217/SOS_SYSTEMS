import { fetchWithAuth } from './client';
import type { SafeLocationItem } from '@/types/dashboard';

export async function fetchSafeLocations(params: Record<string, string> = {}): Promise<{ success: boolean; data: SafeLocationItem[] }> {
  const query = new URLSearchParams(params).toString();
  const endpoint = query ? `/safe-locations?${query}` : '/safe-locations';
  const raw = await fetchWithAuth<any>(endpoint, { method: 'GET' });
  if (Array.isArray(raw.data)) {
    return { success: raw.success, data: raw.data };
  }
  return raw;
}

export async function createSafeLocation(payload: {
  name: string;
  type: string;
  address: string;
  capacity: number;
  currentOccupancy?: number;
  status?: string;
  areaId: string;
  location: { type: 'Point'; coordinates: [number, number] };
}): Promise<{ success: boolean; data: SafeLocationItem; message?: string }> {
  return fetchWithAuth('/safe-locations', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateSafeLocation(
  id: string,
  payload: Partial<{
    name: string;
    type: string;
    address: string;
    capacity: number;
    currentOccupancy: number;
    status: string;
    areaId: string;
    location: { type: 'Point'; coordinates: [number, number] };
  }>
): Promise<{ success: boolean; data: SafeLocationItem; message?: string }> {
  return fetchWithAuth(`/safe-locations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteSafeLocation(
  id: string
): Promise<{ success: boolean; message: string }> {
  return fetchWithAuth(`/safe-locations/${id}`, {
    method: 'DELETE',
  });
}
