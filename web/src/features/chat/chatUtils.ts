import type { ChatMessageItem } from '@/types/chat';
import type { StatusTone } from '@/kit/ui-patterns';

export const cleanChatName = (name: string): string =>
  name.replace(/tác chiến\s*/gi, '').replace(/\s+/g, ' ').trim();

export const getChatInitials = (name?: string): string => {
  const cleaned = (name || 'C')
    .replace(/^(phường|xã|cán bộ|quản trị|bql|bch)\s+/i, '')
    .trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'C';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

export const SOS_TYPE_LABELS: Record<string, string> = {
  MEDICAL: 'Cấp cứu y tế / Bị thương',
  FIRE: 'Hỏa hoạn / Cháy nổ',
  FLOOD: 'Cứu hộ ngập lụt / Mắc kẹt',
  LANDSLIDE: 'Sạt lở đất / Đổ sập',
  STORM: 'Bão lốc / Cây đổ',
  ACCIDENT: 'Tai nạn khẩn cấp',
  MISSING_PERSON: 'Tìm kiếm người mất tích',
  RESCUE: 'Cứu hộ khẩn cấp',
  FOOD: 'Cứu trợ lương thực',
  EVACUATION: 'Sơ tán khẩn cấp',
  OTHER: 'Cứu nạn khẩn cấp khác',
};

export const SOS_STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string; tone: StatusTone }
> = {
  PENDING: { label: 'Chờ tiếp nhận', color: 'var(--dm-amber-text)', bgColor: 'var(--dm-amber-bg)', tone: 'warning' },
  VERIFIED: { label: 'Đã xác minh', color: 'var(--dm-blue-text)', bgColor: 'var(--dm-blue-bg)', tone: 'info' },
  ASSIGNED: { label: 'Đã phân công', color: 'var(--dm-purple-text)', bgColor: 'var(--dm-purple-bg)', tone: 'info' },
  ACCEPTED: { label: 'Đội đã nhận lệnh', color: 'var(--dm-purple-text)', bgColor: 'var(--dm-purple-bg)', tone: 'info' },
  ON_THE_WAY: { label: 'Đang di chuyển', color: 'var(--dm-blue-text)', bgColor: 'var(--dm-blue-bg)', tone: 'info' },
  EN_ROUTE: { label: 'Đang di chuyển', color: 'var(--dm-blue-text)', bgColor: 'var(--dm-blue-bg)', tone: 'info' },
  ARRIVED: { label: 'Đã tiếp cận hiện trường', color: 'var(--dm-green-text)', bgColor: 'var(--dm-green-bg)', tone: 'success' },
  IN_PROGRESS: { label: 'Đang cứu hộ', color: 'var(--dm-blue-text)', bgColor: 'var(--dm-blue-bg)', tone: 'info' },
  RESCUING: { label: 'Đang cứu nạn', color: 'var(--dm-red-text)', bgColor: 'var(--dm-red-bg)', tone: 'danger' },
  COMPLETED: { label: 'Hoàn thành', color: 'var(--dm-green-text)', bgColor: 'var(--dm-green-bg)', tone: 'success' },
  RESOLVED: { label: 'Đã giải quyết', color: 'var(--dm-green-text)', bgColor: 'var(--dm-green-bg)', tone: 'success' },
  CANCELLED: { label: 'Đã hủy', color: 'var(--dm-red-text)', bgColor: 'var(--dm-red-bg)', tone: 'muted' },
  REJECTED: { label: 'Từ chối', color: 'var(--dm-red-text)', bgColor: 'var(--dm-red-bg)', tone: 'danger' },
};

export interface ParsedSosPayload {
  sosId?: string;
  sosCode: string;
  typeLabel: string;
  people: number;
  address: string;
  phone: string;
  description: string;
  status: string;
  statusLabel: string;
  statusTone: StatusTone;
  coords: { lat: number; lng: number } | null;
  images: string[];
}

export const parseSosMessage = (
  msg: ChatMessageItem,
  liveStatusMap?: Record<string, string>
): ParsedSosPayload | null => {
  const isSos =
    Boolean(msg.sosRequestId) ||
    Boolean(msg.sosData) ||
    (typeof msg.content === 'string' &&
      (msg.content.includes('[YÊU CẦU CỨU NẠN KHẨN CẤP]') ||
        msg.content.includes('🆘 [YÊU CẦU CỨU NẠN') ||
        msg.content.includes('Mã cứu trợ: SOS-')));

  if (!isSos) return null;

  if (msg.sosData && typeof msg.sosData === 'object') {
    const s = msg.sosData;
    const typeLabel =
      SOS_TYPE_LABELS[s.emergencyType] ||
      (Array.isArray(s.emergencyTypes) && s.emergencyTypes.length > 0
        ? s.emergencyTypes.map((t: string) => SOS_TYPE_LABELS[t] || t).join(', ')
        : s.emergencyType || 'Cứu hộ khẩn cấp');
    const coords = s.location?.coordinates;
    const lat = typeof coords?.[1] === 'number' ? coords[1] : undefined;
    const lng = typeof coords?.[0] === 'number' ? coords[0] : undefined;

    const rawId = String(
      s._id ||
        (typeof msg.sosRequestId === 'object' ? (msg.sosRequestId as any)?._id : msg.sosRequestId) ||
        ''
    );
    const rawCode = String(s.sosCode || '');
    const liveStatus =
      (liveStatusMap && ((rawId && liveStatusMap[rawId]) || (rawCode && liveStatusMap[rawCode]))) ||
      s.status ||
      'PENDING';
    const statusCfg = SOS_STATUS_CONFIG[liveStatus] || SOS_STATUS_CONFIG.PENDING;

    return {
      sosId: s._id || msg.sosRequestId,
      sosCode: s.sosCode || 'SOS',
      typeLabel,
      people: s.people || 1,
      address: s.address || '',
      phone: s.contactPhone || '',
      description: s.description || '',
      status: liveStatus,
      statusLabel: statusCfg.label,
      statusTone: statusCfg.tone,
      coords: typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null,
      images: Array.isArray(s.images)
        ? s.images
        : Array.isArray(msg.attachments)
          ? msg.attachments.map((a) => a.url).filter(Boolean)
          : [],
    };
  }

  const content = msg.content || '';
  const codeMatch = content.match(/Mã cứu trợ:\s*(SOS-[A-Z0-9\-]+)/i);
  const typeMatch = content.match(/Loại yêu cầu:\s*([^\n]+)/i);
  const peopleMatch = content.match(/Số người gặp nạn:\s*([0-9]+)/i);
  const addrMatch = content.match(/Địa chỉ:\s*([^\n]+)/i);
  const gpsMatch = content.match(/Tọa độ GPS:\s*([0-9]+\.[0-9]+),\s*([0-9]+\.[0-9]+)/i);
  const phoneMatch = content.match(/Số điện thoại:\s*([0-9\+\s]+)/i);
  const descMatch = content.match(/Tình trạng:\s*([^\n]+)/i);
  const statusMatch = content.match(/Trạng thái hiện tại:\s*([^\n]+)/i);

  const rawStatus = statusMatch ? statusMatch[1].trim() : 'PENDING';
  const matchedKey =
    Object.keys(SOS_STATUS_CONFIG).find(
      (k) => SOS_STATUS_CONFIG[k].label.toLowerCase() === rawStatus.toLowerCase()
    ) || 'PENDING';

  const rawCode = codeMatch ? codeMatch[1].trim() : '';
  const rawId = String(
    (typeof msg.sosRequestId === 'object' ? (msg.sosRequestId as any)?._id : msg.sosRequestId) || ''
  );
  const liveStatus =
    (liveStatusMap && ((rawId && liveStatusMap[rawId]) || (rawCode && liveStatusMap[rawCode]))) ||
    matchedKey;
  const statusCfg = SOS_STATUS_CONFIG[liveStatus] || SOS_STATUS_CONFIG.PENDING;

  return {
    sosId: msg.sosRequestId || undefined,
    sosCode: rawCode || 'SOS',
    typeLabel: typeMatch ? typeMatch[1].trim() : 'Cứu hộ khẩn cấp',
    people: peopleMatch ? parseInt(peopleMatch[1], 10) : 1,
    address: addrMatch ? addrMatch[1].trim() : '',
    phone: phoneMatch ? phoneMatch[1].trim() : '',
    description: descMatch ? descMatch[1].trim() : '',
    status: liveStatus,
    statusLabel: statusCfg.label,
    statusTone: statusCfg.tone,
    coords: gpsMatch ? { lat: parseFloat(gpsMatch[1]), lng: parseFloat(gpsMatch[2]) } : null,
    images: Array.isArray(msg.attachments) ? msg.attachments.map((a) => a.url).filter(Boolean) : [],
  };
};

export const parseGpsContent = (
  content: string
): { lat: number; lng: number; address: string } | null => {
  if (!content) return null;
  const match = content.match(/([0-9]+\.[0-9]+),\s*([0-9]+\.[0-9]+)/);
  if (!match) return null;

  const lat = parseFloat(match[1]);
  const lng = parseFloat(match[2]);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

  const addrMatch = content.match(/\(Vị trí gần:\s*([^\)]+)\)/i);
  const address = addrMatch ? addrMatch[1].trim() : '';
  return { lat, lng, address };
};

/* ==========================================================================
   Chronicle Time Formatting & 5-Minute Message Grouping (features/mail/format.ts + thread.tsx)
   ========================================================================== */

const MS_DAY = 24 * 3600 * 1000;
const GROUP_GAP_MS = 5 * 60 * 1000;

function localDayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function daysAgo(iso: string): number {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.round((localDayStart(new Date()) - localDayStart(date)) / MS_DAY);
}

export function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

export function formatShortTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diff = daysAgo(iso);
  if (diff <= 0) return formatClock(iso);
  if (diff === 1) return 'Hôm qua';
  if (diff < 7) {
    return date.toLocaleDateString('vi-VN', { weekday: 'short' });
  }
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

export function formatDayHeading(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Hôm nay';
  const diff = daysAgo(iso);
  if (diff <= 0) return 'Hôm nay';
  if (diff === 1) return 'Hôm qua';
  return date.toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function getSenderIdStr(msg: ChatMessageItem): string {
  return typeof msg.senderId === 'object' && msg.senderId !== null
    ? msg.senderId._id
    : String(msg.senderId || '');
}

export interface ChatMessageGroup {
  key: string;
  senderId: string;
  day: string | null;
  messages: ChatMessageItem[];
}

export function groupChatMessages(messages: ChatMessageItem[]): ChatMessageGroup[] {
  const groups: ChatMessageGroup[] = [];
  messages.forEach((message, index) => {
    const previous = messages[index - 1];
    const senderId = getSenderIdStr(message);
    const prevSenderId = previous ? getSenderIdStr(previous) : null;
    const newDay = !previous || daysAgo(previous.createdAt) !== daysAgo(message.createdAt);
    const prevTime = previous ? new Date(previous.createdAt).getTime() : 0;
    const currTime = new Date(message.createdAt).getTime();
    const last = groups[groups.length - 1];

    if (
      last &&
      !newDay &&
      prevSenderId === senderId &&
      Number.isFinite(currTime - prevTime) &&
      currTime - prevTime < GROUP_GAP_MS
    ) {
      last.messages.push(message);
      return;
    }

    groups.push({
      key: message._id || `${index}-${message.createdAt}`,
      senderId,
      day: newDay ? formatDayHeading(message.createdAt) : null,
      messages: [message],
    });
  });
  return groups;
}
