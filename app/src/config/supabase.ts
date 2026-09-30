import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { ENV } from './env';

// Hỗ trợ đóng browser sau khi OAuth redirect hoàn tất
WebBrowser.maybeCompleteAuthSession();

// Bộ nhớ đệm Client Supabase an toàn với Hermes Engine
const clientCache = {
  instance: null as SupabaseClient | null,
  url: '',
  key: '',
};

/**
 * Kiểm tra xem cấu hình Supabase đã được điền thông tin thực tế chưa
 */
export const isSupabaseConfigured = (): boolean => {
  return (
    Boolean(ENV.SUPABASE_URL) &&
    !ENV.SUPABASE_URL.includes('your-project') &&
    !ENV.SUPABASE_URL.includes('xyzcompany') &&
    !ENV.SUPABASE_URL.includes('placeholder') &&
    Boolean(ENV.SUPABASE_ANON_KEY) &&
    !ENV.SUPABASE_ANON_KEY.includes('your_supabase_anon_key') &&
    !ENV.SUPABASE_ANON_KEY.includes('dummy_anon_key') &&
    !ENV.SUPABASE_ANON_KEY.includes('placeholder')
  );
};

/**
 * Lấy hoặc khởi tạo Supabase Client
 */
export const getSupabaseClient = (): SupabaseClient => {
  const url = ENV.SUPABASE_URL || 'https://placeholder.supabase.co';
  const key = ENV.SUPABASE_ANON_KEY || 'placeholder-key';

  if (!clientCache.instance || clientCache.url !== url || clientCache.key !== key) {
    clientCache.url = url;
    clientCache.key = key;
    clientCache.instance = createClient(url, key, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
      },
    });
  }
  return clientCache.instance;
};

export const supabase = {
  get auth() {
    return getSupabaseClient().auth;
  },
};

/**
 * Thực hiện đăng nhập Google thông qua Supabase OAuth + Expo WebBrowser
 */
export const signInWithGoogleOAuth = async () => {
  try {
    if (!isSupabaseConfigured()) {
      throw new Error(
        'Vui lòng cấu hình SUPABASE_URL và SUPABASE_ANON_KEY trong file .env trước khi sử dụng Supabase Google Auth.'
      );
    }

    const client = getSupabaseClient();

    // 1. Tạo Redirect URI tương thích cả Web, Expo Go và Bản cài đặt độc lập
    let redirectUri: string;
    if (Platform.OS === 'web') {
      redirectUri = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8081';
    } else {
      redirectUri = AuthSession.makeRedirectUri({
        scheme: ENV.AUTH_REDIRECT_SCHEME,
        path: 'auth/callback',
      });
    }

    console.log('[Supabase OAuth] Redirect URI đang dùng:', redirectUri);

    // 2. Yêu cầu đăng nhập Google từ Supabase
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUri,
        skipBrowserRedirect: Platform.OS !== 'web',
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    if (error) throw error;

    // Trên môi trường Web, Supabase sẽ tự động chuyển hướng trang
    if (Platform.OS === 'web') {
      return null;
    }

    if (!data?.url) throw new Error('Không nhận được đường dẫn xác thực OAuth từ Supabase.');

    // 3. Mở trình duyệt in-app trên Mobile (Android/iOS)
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);

    if (result.type === 'success' && result.url) {
      // Phân tích tokens từ URL redirect
      const url = result.url;
      const hashIndex = url.indexOf('#');
      const queryIndex = url.indexOf('?');
      const fragment = hashIndex !== -1 ? url.substring(hashIndex + 1) : '';
      const queryString = queryIndex !== -1 ? url.substring(queryIndex + 1) : '';

      const params = new URLSearchParams(fragment || queryString);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (accessToken && refreshToken) {
        const { data: sessionData, error: sessionError } = await client.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (sessionError) throw sessionError;
        return {
          session: sessionData.session,
          user: sessionData.user,
          providerToken: params.get('provider_token') || accessToken,
        };
      }
    }

    return null;
  } catch (error: any) {
    console.warn('[Supabase OAuth Error]:', error.message);
    throw error;
  }
};
