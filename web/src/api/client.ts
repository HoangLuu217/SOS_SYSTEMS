export const RAW_BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:5000').replace(/\/+$/, '');
export const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');
export const DIRECT_BACKEND = `${RAW_BACKEND_URL}/api`;

export async function safeParseResponse(res: Response): Promise<any> {
  const text = await res.text();
  if (!text || !text.trim()) {
    if (!res.ok) {
      throw new Error(`Máy chủ không phản hồi nội dung (HTTP ${res.status}). Vui lòng kiểm tra Backend server.`);
    }
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Phản hồi máy chủ không hợp lệ (HTTP ${res.status}). Vui lòng kiểm tra Backend server.`);
  }
}

let refreshPromise: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('sos_refresh_token');
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ refreshToken }),
    });

    const data = await safeParseResponse(res);
    if (res.ok && data.success && data.data?.accessToken) {
      const newAccessToken = data.data.accessToken;
      localStorage.setItem('sos_access_token', newAccessToken);
      if (data.data.refreshToken) {
        localStorage.setItem('sos_refresh_token', data.data.refreshToken);
      }
      return newAccessToken;
    }
  } catch (e) {
    console.warn('Lỗi tự động làm mới token:', e);
  }
  return null;
}

/**
 * Helper gọi API kèm Header Authorization token tự động và xử lý fallback URL & Silent Refresh Token
 */
export async function fetchWithAuth<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  let token = localStorage.getItem('sos_access_token');
  const userStr = localStorage.getItem('sos_auth_user');
  let userId = '';
  if (userStr) {
    try {
      const u = JSON.parse(userStr);
      userId = u._id || u.id || '';
    } catch { }
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(userId ? { 'x-user-id': userId } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (userId) {
    headers['x-user-id'] = userId;
  }

  const mergedOptions: RequestInit = {
    ...options,
    headers,
    credentials: 'include',
  };

  try {
    let res = await fetch(`${API_BASE}${endpoint}`, mergedOptions);

    // Xử lý khi Token hết hạn (HTTP 401): Tự động làm mới bằng Refresh Token mà không gián đoạn người dùng
    if (!res.ok && res.status === 401 && endpoint !== '/auth/refresh' && endpoint !== '/auth/login') {
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }
      const newToken = await refreshPromise;
      if (newToken) {
        token = newToken;
        headers['Authorization'] = `Bearer ${newToken}`;
        res = await fetch(`${API_BASE}${endpoint}`, {
          ...mergedOptions,
          headers,
        });
      }
    }

    if (!res.ok && res.status >= 500) {
      throw new Error(`Proxy error HTTP ${res.status}`);
    }
    const data = await safeParseResponse(res);
    if (!res.ok) {
      throw new Error(data.message || 'Lỗi xử lý yêu cầu máy chủ');
    }
    return data;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '';
    if (
      message.includes('Failed to fetch') ||
      message.includes('NetworkError') ||
      message.includes('Proxy error') ||
      message.includes('không phản hồi')
    ) {
      const directRes = await fetch(`${DIRECT_BACKEND}${endpoint}`, mergedOptions);
      const directData = await safeParseResponse(directRes);
      if (!directRes.ok) {
        throw new Error(directData.message || 'Lỗi xử lý yêu cầu máy chủ', { cause: err });
      }
      return directData;
    }
    throw err;
  }
}
