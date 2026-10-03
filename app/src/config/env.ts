import { Platform } from 'react-native';

/**
 * Cấu hình môi trường cho ứng dụng SOS SYSTEMS
 * - Tự động đọc từ file .env (tiền tố EXPO_PUBLIC_)
 * - Hỗ trợ đồng bộ cấu hình Supabase từ backend/.env thông qua GET /api/config
 */

export const getDefaultApiUrl = () => {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:5000/api';
  }
  return 'http://localhost:5000/api';
};

const cleanSupabaseUrl = (url?: string) => {
  if (!url) return '';
  return url.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
};

export const ENV = {
  // SOS Backend API Base URL (đọc từ EXPO_PUBLIC_API_URL trong .env)
  API_BASE_URL: getDefaultApiUrl(),

  // Cấu hình Supabase (đọc trực tiếp từ file .env với tiền tố EXPO_PUBLIC_)
  SUPABASE_URL: cleanSupabaseUrl(process.env.EXPO_PUBLIC_SUPABASE_URL || ''),
  SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',

  // Google OAuth Client ID (đọc trực tiếp từ file .env)
  GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '',

  // App Scheme (đồng bộ với app.json: "scheme": "sosapp")
  AUTH_REDIRECT_SCHEME: 'sosapp',

  // Cấu hình Firebase Phone Auth (đọc từ .env hoặc đồng bộ từ backend)
  FIREBASE: {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '',
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '',
    measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID || '',
  },

  // Storage Keys
  STORAGE_KEYS: {
    ACCESS_TOKEN: '@sos_access_token',
    REFRESH_TOKEN: '@sos_refresh_token',
    USER_DATA: '@sos_user_data',
    CUSTOM_API_URL: '@sos_custom_api_url',
    AUTH_MODE: '@sos_auth_mode',
  },
};

/**
 * Hàm đồng bộ cấu hình từ Backend (được định nghĩa trong backend/.env)
 */
export const syncConfigFromBackend = async (baseUrl?: string): Promise<boolean> => {
  try {
    const url = baseUrl || ENV.API_BASE_URL;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(`${url}/config`, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const json = await res.json();
      if (json.success && json.data) {
        if (json.data.supabaseUrl) {
          ENV.SUPABASE_URL = cleanSupabaseUrl(json.data.supabaseUrl);
        }
        if (json.data.supabaseAnonKey) {
          ENV.SUPABASE_ANON_KEY = json.data.supabaseAnonKey;
        }
        if (json.data.googleClientId) {
          ENV.GOOGLE_WEB_CLIENT_ID = json.data.googleClientId;
        }
        if (json.data.firebase) {
          ENV.FIREBASE = {
            apiKey: json.data.firebase.apiKey || ENV.FIREBASE.apiKey,
            authDomain: json.data.firebase.authDomain || ENV.FIREBASE.authDomain,
            projectId: json.data.firebase.projectId || ENV.FIREBASE.projectId,
            storageBucket: json.data.firebase.storageBucket || ENV.FIREBASE.storageBucket,
            messagingSenderId: json.data.firebase.messagingSenderId || ENV.FIREBASE.messagingSenderId,
            appId: json.data.firebase.appId || ENV.FIREBASE.appId,
            measurementId: json.data.firebase.measurementId || ENV.FIREBASE.measurementId,
          };
        }
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
};
