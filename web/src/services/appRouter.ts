import type { User } from '@/types/auth';
import type { NavItemKey } from '@/components/layout';

export const getRolePrefix = (user: User | null): '/authority' | '/admin' => {
  if (!user) {
    const savedRole = localStorage.getItem('sos_active_portal');
    return savedRole === 'admin' ? '/admin' : '/authority';
  }
  const isAuthority =
    (Boolean(user.authority) ||
      Boolean(user.roles?.includes('LOCAL_AUTHORITY')) ||
      Boolean(user.roles?.includes('AUTHORITY'))) &&
    !user.roles?.includes('ADMIN');
  return isAuthority ? '/authority' : '/admin';
};

export interface ParsedRoute {
  rolePrefix: '/authority' | '/admin';
  navKey: NavItemKey;
  subPath?: string;
  sosId?: string;
}

const VALID_KEYS: Set<string> = new Set([
  'map',
  'sos_requests',
  'coordination',
  'rescuers',
  'resources',
  'notifications',
  'alerts',
  'shelters',
  'hazard_reports',
  'reports',
  'operation_logs',
  'chat',
  'settings',
  'admin_overview',
  'citizens',
  'rescuers_admin',
  'authorities',
  'areas',
  'rbac',
  'audit_logs',
]);

// Aliases thân thiện
const KEY_ALIASES: Record<string, NavItemKey> = {
  overview: 'admin_overview',
  dashboard: 'admin_overview',
  sos: 'sos_requests',
  requests: 'sos_requests',
  dispatch: 'coordination',
  shelter: 'shelters',
  safe_locations: 'shelters',
  danger_points: 'hazard_reports',
  logs: 'operation_logs',
  history: 'operation_logs',
  messages: 'chat',
  conversation: 'chat',
  alerts: 'notifications',
  alert: 'notifications',
  notification: 'notifications',
  broadcast: 'notifications',
  'thong-bao': 'notifications',
  'thong_bao': 'notifications',
  'thongbao': 'notifications',
  'gui-thong-bao': 'notifications',
};


/**
 * Trích xuất route và subPath từ pathname hoặc hash cũ (backward-compatibility)
 */
export function parseRoute(
  pathname: string = window.location.pathname,
  hash: string = window.location.hash,
  user: User | null = null
): ParsedRoute {
  const defaultPrefix = getRolePrefix(user);

  // 1. Kiểm tra hash cũ (nếu có truy cập từ link cũ dạng #map/sos-8924 hoặc #sos_requests)
  if (hash && hash !== '#') {
    const cleanHash = hash.replace(/^#\/?/, '');
    const hashParts = cleanHash.split('/');
    const firstPart = hashParts[0]?.toLowerCase();
    const sub = hashParts.slice(1).join('/');

    let resolvedKey: NavItemKey = 'map';
    if (VALID_KEYS.has(firstPart)) {
      resolvedKey = firstPart as NavItemKey;
    } else if (firstPart in KEY_ALIASES) {
      resolvedKey = KEY_ALIASES[firstPart];
    }

    const sosId = resolvedKey === 'map' && hashParts[1] ? hashParts[1] : undefined;
    return {
      rolePrefix: defaultPrefix,
      navKey: resolvedKey,
      subPath: sub || undefined,
      sosId,
    };
  }

  // 2. Phân tích clean pathname: e.g. /local_authority/sos_requests hoặc /admin/map/sos-8924
  const segments = pathname
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean);

  let rolePrefix: '/authority' | '/admin' = defaultPrefix;
  let keyIndex = 0;

  if (
    segments[0] === 'authority' ||
    segments[0] === 'local_authority' ||
    segments[0] === 'localauthority' ||
    segments[0] === 'localauthor' ||
    segments[0] === 'local-authority'
  ) {
    rolePrefix = '/authority';
    keyIndex = 1;
  } else if (segments[0] === 'admin') {
    rolePrefix = '/admin';
    keyIndex = 1;
  }

  const rawKey = (segments[keyIndex] || '').toLowerCase();
  const subSegments = segments.slice(keyIndex + 1);
  const subPath = subSegments.join('/') || undefined;

  let navKey: NavItemKey = rolePrefix === '/admin' ? 'map' : 'map';

  if (VALID_KEYS.has(rawKey)) {
    navKey = rawKey as NavItemKey;
  } else if (rawKey in KEY_ALIASES) {
    navKey = KEY_ALIASES[rawKey];
  } else if (rolePrefix === '/admin' && !rawKey) {
    navKey = 'map';
  }

  const sosId = navKey === 'map' && subSegments[0] ? subSegments[0] : undefined;

  return {
    rolePrefix,
    navKey,
    subPath,
    sosId,
  };
}

/**
 * Tạo URL đường dẫn chuẩn không có '#'
 * Ví dụ:
 * - /localauthor/sos_requests
 * - /localauthor/map/sos-8924
 * - /admin/map
 */
export function buildRouteUrl(
  navKey: NavItemKey,
  user: User | null,
  subPath?: string
): string {
  const prefix = getRolePrefix(user);
  if (subPath) {
    return `${prefix}/${navKey}/${subPath}`;
  }
  return `${prefix}/${navKey}`;
}

/**
 * Điều hướng SPA không reload trang, cập nhật pathname trên URL
 */
export function navigateTo(
  navKey: NavItemKey,
  user: User | null,
  subPath?: string,
  replace: boolean = false
): void {
  const url = buildRouteUrl(navKey, user, subPath);

  if (window.location.pathname !== url || window.location.hash) {
    if (replace) {
      window.history.replaceState({ navKey, subPath }, '', url);
    } else {
      window.history.pushState({ navKey, subPath }, '', url);
    }
  }

  // Thông báo các listener popstate / navigation
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/**
 * Trích xuất SOS ID hiện tại từ URL (hỗ trợ cả /localauthor/map/:id và #map/:id)
 */
export function getCurrentSosIdFromUrl(): string | undefined {
  const parsed = parseRoute(window.location.pathname, window.location.hash);
  return parsed.sosId;
}
