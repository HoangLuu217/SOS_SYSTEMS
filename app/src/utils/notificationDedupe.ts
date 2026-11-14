export interface DedupeNotificationInput {
  _id?: string | null;
  id?: string | null;
  title?: string | null;
  content?: string | null;
  body?: string | null;
  data?: Record<string, any> | null;
}

const CONTENT_SIG_PREFIX = 'sig:';
const CONTENT_SIG_TTL_MS = 180 * 1000; // 3 phút: chống trùng lặp qua ranh giới phút giữa Remote Push, SSE và Polling
const STRUCTURAL_KEY_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_TRACKED_KEYS = 400;

const recentHandledTimestamps = new Map<string, number>();
const recentPresentedTimestamps = new Map<string, number>();

function isSyntheticId(id: string): boolean {
  return (
    id.startsWith('sse_') ||
    id.startsWith('local-') ||
    id.startsWith('test-')
  );
}

function normalizeTextForSignature(value?: string | null): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pruneExpiredKeys(now: number, targetMap: Map<string, number>) {
  if (targetMap.size <= MAX_TRACKED_KEYS) return;
  for (const [key, ts] of targetMap.entries()) {
    const ttl = key.startsWith(CONTENT_SIG_PREFIX)
      ? CONTENT_SIG_TTL_MS
      : STRUCTURAL_KEY_TTL_MS;
    if (now - ts > ttl) {
      targetMap.delete(key);
    }
  }
  while (targetMap.size > MAX_TRACKED_KEYS) {
    const oldestKey = targetMap.keys().next().value;
    if (!oldestKey) break;
    targetMap.delete(oldestKey);
  }
}

/**
 * Trích xuất tất cả các khóa định danh duy nhất (structural ID + chữ ký nội dung)
 * để đối chiếu nhất quán giữa Remote Expo Push, SSE Stream và Polling DB.
 */
export function extractNotificationDedupeKeys(input: DedupeNotificationInput): string[] {
  const keys: string[] = [];
  const data = (input.data || {}) as Record<string, any>;

  const rawNotifId = data.notificationId || input._id || input.id;
  if (rawNotifId) {
    const idStr = String(rawNotifId).trim();
    if (idStr && !isSyntheticId(idStr)) {
      keys.push(`notif:${idStr}`);
    }
  }

  if (data.broadcastId) {
    keys.push(`broadcast:${String(data.broadcastId).trim()}`);
  }

  if (data.eventId) {
    const stage = String(data.reminderType || 'CREATED').trim();
    keys.push(`blood:${String(data.eventId).trim()}:${stage}`);
  }

  if (data.safetyCheckId) {
    keys.push(`safety:${String(data.safetyCheckId).trim()}`);
  }

  if (data.messageId) {
    keys.push(`chat:${String(data.messageId).trim()}`);
  }

  const normTitle = normalizeTextForSignature(input.title || data.title);
  const normBody = normalizeTextForSignature(
    input.content || input.body || data.content || data.body
  );
  if (normTitle || normBody) {
    keys.push(`${CONTENT_SIG_PREFIX}${normTitle}::${normBody}`);
  }

  return keys;
}

/**
 * Trả về các khóa cấu trúc bền vững (không phụ thuộc thời gian) để lưu AsyncStorage / seenIdsRef
 */
export function extractPersistentDedupeKeys(input: DedupeNotificationInput): string[] {
  return extractNotificationDedupeKeys(input).filter(
    (k) => !k.startsWith(CONTENT_SIG_PREFIX)
  );
}

function hasMatchingRecentKey(
  targetMap: Map<string, number>,
  input: DedupeNotificationInput
): boolean {
  const now = Date.now();
  const keys = extractNotificationDedupeKeys(input);
  const structuralKeys = keys.filter((k) => !k.startsWith(CONTENT_SIG_PREFIX));
  // Nếu thông báo có khóa định danh riêng (notificationId/broadcastId/eventId/...),
  // chỉ đối chiếu theo khóa định danh để không chặn nhầm thông báo MỚI có cùng tiêu đề/nội dung.
  const keysToCheck = structuralKeys.length > 0 ? structuralKeys : keys;

  for (const key of keysToCheck) {
    const ts = targetMap.get(key);
    if (ts === undefined) continue;
    const ttl = key.startsWith(CONTENT_SIG_PREFIX)
      ? CONTENT_SIG_TTL_MS
      : STRUCTURAL_KEY_TTL_MS;
    if (now - ts <= ttl) {
      return true;
    }
    targetMap.delete(key);
  }
  return false;
}

function markKeysInMap(
  targetMap: Map<string, number>,
  input: DedupeNotificationInput
): void {
  const now = Date.now();
  const keys = extractNotificationDedupeKeys(input);
  for (const key of keys) {
    targetMap.set(key, now);
  }
  pruneExpiredKeys(now, targetMap);
}

/**
 * Kiểm tra xem thông báo tương ứng đã được tiếp nhận/xử lý gần đây hay chưa
 */
export function hasRecentNotification(input: DedupeNotificationInput): boolean {
  return hasMatchingRecentKey(recentHandledTimestamps, input);
}

/**
 * Đánh dấu thông báo đã được tiếp nhận/xử lý trong luồng dữ liệu
 */
export function markNotificationHandled(input: DedupeNotificationInput): void {
  markKeysInMap(recentHandledTimestamps, input);
}

/**
 * Kiểm tra xem thông báo tương ứng đã thực sự được hiển thị ra khay/banner hệ điều hành gần đây hay chưa
 */
export function hasRecentlyPresentedNotification(input: DedupeNotificationInput): boolean {
  return hasMatchingRecentKey(recentPresentedTimestamps, input);
}

/**
 * Đánh dấu thông báo đã thực sự được hiển thị ra hệ điều hành (Remote Push hoặc Local Notification)
 */
export function markNotificationPresented(input: DedupeNotificationInput): void {
  markKeysInMap(recentPresentedTimestamps, input);
}

