export interface ShoreHandoffProgressMeta {
  label: string;
  bg: string;
  color: string;
  borderColor: string;
  feedTitle: string;
  isDone: boolean;
}

const STATUS_META_MAP: Record<string, ShoreHandoffProgressMeta> = {
  COMPLETED: {
    label: '✓ ĐÃ XONG',
    bg: '#f1f5f9',
    color: '#334155',
    borderColor: '#cbd5e1',
    feedTitle: 'Xe đã hoàn thành đón',
    isDone: true,
  },
  IN_PROGRESS: {
    label: 'ĐANG ĐÓN',
    bg: '#f1f5f9',
    color: '#334155',
    borderColor: '#cbd5e1',
    feedTitle: 'Xe đang đón tại bến',
    isDone: false,
  },
  RESCUING: {
    label: 'ĐANG ĐÓN',
    bg: '#f1f5f9',
    color: '#334155',
    borderColor: '#cbd5e1',
    feedTitle: 'Xe đang đón tại bến',
    isDone: false,
  },
  ARRIVED: {
    label: 'ĐÃ ĐẾN',
    bg: '#f1f5f9',
    color: '#334155',
    borderColor: '#cbd5e1',
    feedTitle: 'Xe đã đến bến đón',
    isDone: false,
  },
  ON_SCENE: {
    label: 'ĐÃ ĐẾN',
    bg: '#f1f5f9',
    color: '#334155',
    borderColor: '#cbd5e1',
    feedTitle: 'Xe đã đến bến đón',
    isDone: false,
  },
  EN_ROUTE: {
    label: 'ĐANG ĐẾN',
    bg: '#f1f5f9',
    color: '#334155',
    borderColor: '#cbd5e1',
    feedTitle: 'Xe đang đến bến đón',
    isDone: false,
  },
  ON_THE_WAY: {
    label: 'ĐANG ĐẾN',
    bg: '#f1f5f9',
    color: '#334155',
    borderColor: '#cbd5e1',
    feedTitle: 'Xe đang đến bến đón',
    isDone: false,
  },
  DISPATCHED: {
    label: 'ĐANG ĐẾN',
    bg: '#f1f5f9',
    color: '#334155',
    borderColor: '#cbd5e1',
    feedTitle: 'Xe đang đến bến đón',
    isDone: false,
  },
  ACCEPTED: {
    label: 'ĐÃ NHẬN',
    bg: '#f1f5f9',
    color: '#334155',
    borderColor: '#cbd5e1',
    feedTitle: 'Xe đã nhận lệnh',
    isDone: false,
  },
  PENDING: {
    label: 'CHỜ NHẬN',
    bg: '#f1f5f9',
    color: '#475569',
    borderColor: '#cbd5e1',
    feedTitle: 'Chờ xe nhận lệnh',
    isDone: false,
  },
  REJECTED: {
    label: 'TỪ CHỐI',
    bg: '#fee2e2',
    color: '#dc2626',
    borderColor: '#fca5a5',
    feedTitle: 'Xe từ chối nhận lệnh',
    isDone: false,
  },
};

/**
 * Chuẩn hóa nhãn trạng thái ngắn gọn cho xe đón bờ (SHORE_HANDOFF) hiển thị trên web điều phối.
 */
export function getShoreHandoffVehicleStatusMeta(
  handoffStatus?: string,
  assignmentStatus?: string
): ShoreHandoffProgressMeta {
  const hStatus = String(handoffStatus || '').toUpperCase();
  const aStatus = String(assignmentStatus || '').toUpperCase();

  if (hStatus === 'COMPLETED' || aStatus === 'COMPLETED') {
    return STATUS_META_MAP.COMPLETED;
  }
  if (aStatus && STATUS_META_MAP[aStatus]) {
    return STATUS_META_MAP[aStatus];
  }
  if (hStatus === 'ASSIGNED') {
    return STATUS_META_MAP.PENDING;
  }
  return {
    label: 'ĐÃ ĐIỀU',
    bg: '#f1f5f9',
    color: '#334155',
    borderColor: '#cbd5e1',
    feedTitle: 'Đã điều xe đón bờ',
    isDone: false,
  };
}

/**
 * Rút gọn tên điểm cập bờ trên thẻ danh sách gọn (loại bỏ phần tọa độ như "tại tọa độ (15.8545, 108.4003)").
 */
export function formatCompactLandingPointName(name?: string | null, fallback = 'Bến cập bờ'): string {
  const raw = String(name || '').trim();
  if (!raw) return fallback;

  const cleaned = raw
    .replace(/\s*(?:tại\s+)?tọa\s*độ\s*[:(]?\s*[-+]?\d+(?:\.\d+)?\s*,\s*[-+]?\d+(?:\.\d+)?\s*\)?/gi, '')
    .replace(/\s*\(\s*[-+]?\d+(?:\.\d+)?\s*,\s*[-+]?\d+(?:\.\d+)?\s*\)\s*/g, ' ')
    .replace(/[\s·\-:,]+$/g, '')
    .trim();

  return cleaned || fallback;
}
