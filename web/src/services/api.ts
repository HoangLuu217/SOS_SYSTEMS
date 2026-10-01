import type { LoginResponse } from '../types/auth';

// Use relative URL by default so Vite's proxy forwards it to http://localhost:5000
const API_BASE = '/api';
const DIRECT_BACKEND = 'http://127.0.0.1:5000/api';

export async function loginApi(account: string, password: string): Promise<LoginResponse> {
  const isEmail = account.includes('@');
  const payload = isEmail
    ? { email: account.trim(), password }
    : { phone: account.trim(), password };

  // Try relative endpoint first (proxy), fallback to direct port 5000 if proxy fails
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Đăng nhập không thành công');
    }
    return data;
  } catch (err: unknown) {
    // If proxy failed due to network / not setup, try direct backend URL
    const message = err instanceof Error ? err.message : '';
    if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
      const directRes = await fetch(`${DIRECT_BACKEND}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const directData = await directRes.json();
      if (!directRes.ok) {
        throw new Error(directData.message || 'Đăng nhập không thành công');
      }
      return directData;
    }
    throw err;
  }
}

export async function logoutApi(): Promise<void> {
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // Ignore network error on logout
  }
}

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch('/api/health', { method: 'GET' });
    if (res.ok) return true;
  } catch {
    // Try fallback
  }

  try {
    const res = await fetch('http://127.0.0.1:5000/health', { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

