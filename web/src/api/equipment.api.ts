import { fetchWithAuth } from './client';

export interface EquipmentItem {
  _id: string;
  teamId?: {
    _id: string;
    name: string;
    type?: string;
    status?: string;
    areaId?: { _id: string; name: string; code?: string } | string;
  } | string | null;
  providedBy?: {
    _id: string;
    name: string;
    shortName?: string;
    type?: string;
  } | string | null;
  receivedAt?: string | null;
  name: string;
  category:
    | 'LIFE_VEST'
    | 'LIFE_SAVING'
    | 'MEDICAL_KIT'
    | 'MEDICAL_DEVICE'
    | 'COMMUNICATION'
    | 'LIGHTING'
    | 'ROPE_TOOL'
    | 'TOOL'
    | 'VEHICLE_ACCESSORY'
    | 'SHELTER'
    | 'PPE'
    | 'FOOD_WATER'
    | 'WATER_PURIFICATION'
    | 'MEDICAL_SUPPLY'
    | 'FUEL'
    | 'HYGIENE'
    | 'OTHER'
    | (string & {});
  supplyType?: 'DURABLE' | 'CONSUMABLE';
  minThreshold?: number;
  serialNumber?: string | null;
  quantity: number;
  unit: string;
  status:
    | 'AVAILABLE'
    | 'IN_USE'
    | 'BORROWED'
    | 'MAINTENANCE'
    | 'LOST'
    | 'DAMAGED'
    | 'EXPIRED'
    | 'OUT_OF_STOCK'
    | (string & {});
  note?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export async function fetchEquipments(
  params: Record<string, string> = {}
): Promise<{ success: boolean; data: EquipmentItem[] }> {
  const query = new URLSearchParams(params).toString();
  const endpoint = query ? `/equipments?${query}` : '/equipments';
  const raw = await fetchWithAuth<any>(endpoint, { method: 'GET' });
  if (Array.isArray(raw.data)) return { success: raw.success ?? true, data: raw.data };
  return { success: false, data: [] };
}

export async function createEquipment(payload: {
  teamId: string;
  name: string;
  category: string;
  supplyType?: 'DURABLE' | 'CONSUMABLE';
  serialNumber?: string;
  quantity?: number;
  unit?: string;
  status?: string;
  minThreshold?: number;
  providedBy?: string;
  receivedAt?: string;
  note?: string;
}): Promise<{ success: boolean; data: EquipmentItem; message?: string }> {
  return fetchWithAuth('/equipments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateEquipment(
  id: string,
  payload: Partial<{
    name: string;
    category: string;
    supplyType: 'DURABLE' | 'CONSUMABLE';
    serialNumber: string;
    quantity: number;
    unit: string;
    status: string;
    minThreshold: number;
    note: string;
    providedBy: string;
    receivedAt: string;
    teamId: string | null;
  }>
): Promise<{ success: boolean; data: EquipmentItem; message?: string }> {
  return fetchWithAuth(`/equipments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function transferEquipment(
  id: string,
  payload: {
    targetTeamId: string | null;
    quantity: number;
    note?: string;
  }
): Promise<{ success: boolean; data: EquipmentItem; message?: string }> {
  return fetchWithAuth(`/equipments/${id}/transfer`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function consumeEquipment(
  id: string,
  payload: {
    quantity: number;
    destination?: string;
    note?: string;
  }
): Promise<{ success: boolean; data: EquipmentItem; message?: string }> {
  return fetchWithAuth(`/equipments/${id}/consume`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function batchConsumeEquipments(payload: {
  items: { equipmentId: string; name?: string; quantity: number }[];
  destination: string;
  coordinates?: [number, number]; // [lng, lat]
  recipientName?: string;
  note?: string;
  teamId?: string;
  priority?: string;
}): Promise<{ success: boolean; data: any; message?: string }> {
  return fetchWithAuth('/equipments/batch-consume', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateEquipmentStatus(
  id: string,
  status: string,
  note?: string
): Promise<{ success: boolean; data: EquipmentItem; message?: string }> {
  return fetchWithAuth(`/equipments/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, note }),
  });
}

export async function deleteEquipment(
  id: string
): Promise<{ success: boolean; message: string }> {
  return fetchWithAuth(`/equipments/${id}`, { method: 'DELETE' });
}

export interface DispatchHistorySupplyItem {
  supplyId?: string;
  name: string;
  category?: string | null;
  supplyType?: string | null;
  quantity: number;
  unit: string;
}

export interface DispatchHistoryRecord {
  id: string;
  assignmentId: string | null;
  sosRequestId: string | null;
  dispatchCode: string;
  sosCode: string | null;
  mode: 'ASSIGN_TEAM' | 'DIRECT';
  status: string;
  priority: string;
  areaId: string | null;
  destination: string;
  recipientName: string | null;
  actualRecipient: string | null;
  teamId: string | null;
  teamName: string | null;
  teamPhone: string | null;
  leaderName: string | null;
  actorName: string | null;
  note: string | null;
  cancelReason: string | null;
  inventoryRestored: boolean;
  inventoryRestoredAt: string | null;
  proofImages: string[];
  items: DispatchHistorySupplyItem[];
  createdAt: string;
  acceptedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
}

export interface DispatchHistorySummary {
  total: number;
  assignTeamCount: number;
  directCount: number;
  pendingCount: number;
  inProgressCount: number;
  completedCount: number;
  rejectedCount: number;
  restoredCount: number;
}

export interface DispatchHistoryResponse {
  success: boolean;
  data: DispatchHistoryRecord[];
  summary: DispatchHistorySummary;
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export async function fetchEquipmentDispatchHistory(params?: {
  mode?: string;
  status?: string;
  search?: string;
  areaId?: string;
  page?: number;
  limit?: number;
}): Promise<DispatchHistoryResponse> {
  const sp = new URLSearchParams();
  if (params?.mode) sp.set('mode', params.mode);
  if (params?.status) sp.set('status', params.status);
  if (params?.search) sp.set('search', params.search);
  if (params?.areaId) sp.set('areaId', params.areaId);
  if (params?.page) sp.set('page', String(params.page));
  if (params?.limit) sp.set('limit', String(params.limit));
  const qs = sp.toString();
  const raw: any = await fetchWithAuth(`/equipments/dispatch-history${qs ? `?${qs}` : ''}`);
  const payload = Array.isArray(raw?.data) ? raw : (raw?.data || raw);
  return {
    success: Boolean(raw?.success),
    data: Array.isArray(payload?.data) ? payload.data : [],
    summary: payload?.summary || {
      total: 0,
      assignTeamCount: 0,
      directCount: 0,
      pendingCount: 0,
      inProgressCount: 0,
      completedCount: 0,
      rejectedCount: 0,
      restoredCount: 0,
    },
    pagination: payload?.pagination || raw?.meta || {
      total: 0,
      page: params?.page || 1,
      limit: params?.limit || 20,
      totalPages: 1,
    },
  };
}

export const EQUIPMENT_CATEGORY_LABELS: Record<string, string> = {
  LIFE_VEST: 'Áo phao cứu sinh',
  LIFE_SAVING: 'Cứu sinh chuyên dụng',
  MEDICAL_KIT: 'Túi y tế dã chiến',
  MEDICAL_DEVICE: 'Thiết bị y tế cấp cứu',
  COMMUNICATION: 'Bộ đàm / Liên lạc',
  LIGHTING: 'Đèn pin / Chiếu sáng',
  ROPE_TOOL: 'Dây thừng & Tời cứu hộ',
  TOOL: 'Dụng cụ cơ động (Cưa/Kìm)',
  VEHICLE_ACCESSORY: 'Phụ kiện cứu hộ xuồng/xe',
  SHELTER: 'Lều bạt / Trú ẩn',
  PPE: 'Bảo hộ cá nhân (Mũ/Găng)',
  FOOD_WATER: 'Lương khô & Nước sạch',
  OTHER: 'Khác',
};

export const EQUIPMENT_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Sẵn sàng trong kho',
  IN_USE: 'Đang làm nhiệm vụ',
  BORROWED: 'Đã xuất cấp cho đội',
  MAINTENANCE: 'Đang bảo dưỡng',
  LOST: 'Thất lạc / Báo mất',
  DAMAGED: 'Hư hỏng kỹ thuật',
  EXPIRED: 'Hết hạn sử dụng',
  OUT_OF_STOCK: 'Hết tồn kho',
};
