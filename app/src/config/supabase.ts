import { Platform, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import Constants, { ExecutionEnvironment } from 'expo-constants';
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
 * Tạo URL Redirect chính xác tuyệt đối cho cả Expo Go và Standalone (Khắc phục triệt để trên SDK 58)
 */
export const getOAuthRedirectUri = (): string => {
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8081';
  }

  // Lấy linkingUri và hostUri từ Constants (hỗ trợ cả Expo Go chạy qua Tunnel hoặc LAN)
  const linkingUri = (Constants as any).linkingUri as string | undefined;
  const hostUri = Constants.expoConfig?.hostUri || (Constants as any).manifest?.hostUri || (Constants as any).manifest2?.extra?.expoClient?.hostUri;

  // Nhận diện Expo Go: Trên SDK 58 Android, nativeConstants.executionEnvironment trả về 'bare'
  // nên cần kiểm tra appOwnership, expoVersion, linkingUri (bắt đầu bằng exp://) hoặc có hostUri
  const isExpoGo =
    Constants.appOwnership === 'expo' ||
    Boolean((Constants as any).expoVersion) ||
    Boolean(linkingUri && linkingUri.startsWith('exp://')) ||
    Boolean(hostUri && (!Constants.appOwnership || Constants.appOwnership === 'expo'));

  if (isExpoGo) {
    // Trong Expo Go, URL bắt buộc phải có tiền tố /--/auth/callback để Expo Go chuyển tiếp deep link vào App runtime
    if (linkingUri && linkingUri.startsWith('exp://')) {
      const base = linkingUri.replace(/\/--($|\/.*$)/, '').replace(/\/$/, '');
      return `${base}/--/auth/callback`;
    }
    if (hostUri) {
      const cleanHost = hostUri.replace(/^[a-zA-Z0-9+.-]+:\/\//, '').replace(/\/$/, '');
      return `exp://${cleanHost}/--/auth/callback`;
    }
    return AuthSession.makeRedirectUri({ path: 'auth/callback' });
  }

  // Bản cài đặt độc lập (Standalone / Dev Client APK): sử dụng scheme 'sosapp://auth/callback'
  return AuthSession.makeRedirectUri({
    scheme: ENV.AUTH_REDIRECT_SCHEME,
    path: 'auth/callback',
  });
};

/**
 * Thực hiện đăng nhập Google thông qua Supabase OAuth + Expo WebBrowser (Thích nghi Expo SDK 58)
 */
export const signInWithGoogleOAuth = async () => {
  try {
    if (!isSupabaseConfigured()) {
      throw new Error(
        'Vui lòng cấu hình SUPABASE_URL và SUPABASE_ANON_KEY trong file .env trước khi sử dụng Supabase Google Auth.'
      );
    }

    const client = getSupabaseClient();
    const redirectUri = getOAuthRedirectUri();

    console.log('🔄 [Supabase OAuth SDK 58] Redirect URI thực tế:', redirectUri);

    // 1. Đăng ký listener nhận URL dự phòng trước khi gọi browser
    let capturedRedirectUrl: string | null = null;
    let authCompletedResolver: ((url: string) => void) | null = null;
    const authCompletedPromise = new Promise<string>((resolve) => {
      authCompletedResolver = resolve;
    });

    const urlSubscription = Linking.addEventListener('url', (event: { url: string }) => {
      console.log('🔗 [OAuth Deep Link Received]:', event.url);
      if (
        event.url.includes('code=') ||
        event.url.includes('access_token=') ||
        event.url.includes('auth/callback')
      ) {
        capturedRedirectUrl = event.url;
        if (authCompletedResolver) {
          authCompletedResolver(event.url);
        }
        try {
          WebBrowser.dismissAuthSession();
        } catch (_) {}
      }
    });

    // 2. Yêu cầu đăng nhập Google từ Supabase
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUri,
        skipBrowserRedirect: Platform.OS !== 'web',
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account',
        },
      },
    });

    if (error) {
      urlSubscription.remove();
      throw error;
    }

    // Trên môi trường Web, Supabase sẽ tự động chuyển hướng trang
    if (Platform.OS === 'web') {
      urlSubscription.remove();
      return null;
    }

    if (!data?.url) {
      urlSubscription.remove();
      throw new Error('Không nhận được đường dẫn xác thực OAuth từ Supabase.');
    }

    let finalUrl: string | null = null;
    try {
      // Chạy song song: vừa đợi openAuthSessionAsync, vừa đợi deep link từ Linking
      const browserPromise = WebBrowser.openAuthSessionAsync(data.url, redirectUri);
      const raceResult = await Promise.race([
        browserPromise.then((res) => ({ from: 'browser' as const, res })),
        authCompletedPromise.then((url) => ({ from: 'linking' as const, url })),
      ]);

      if (raceResult.from === 'browser') {
        const res = raceResult.res;
        if (res.type === 'success' && res.url) {
          finalUrl = res.url;
        } else if (capturedRedirectUrl) {
          finalUrl = capturedRedirectUrl;
        }
      } else if (raceResult.from === 'linking') {
        finalUrl = raceResult.url;
      }

      // Xử lý race condition trên Android: Khi Chrome đóng, AppState kích hoạt trước Linking event
      // Chờ tối đa 1200ms để deep link kịp chuyển giao từ hệ điều hành
      if (!finalUrl && !capturedRedirectUrl) {
        await Promise.race([
          authCompletedPromise,
          new Promise((r) => setTimeout(r, 1200)),
        ]);
        if (capturedRedirectUrl) {
          finalUrl = capturedRedirectUrl;
        }
      }

      // Fallback thêm từ getInitialURL nếu app vừa được kích hoạt lại từ browser
      if (!finalUrl) {
        const initial = await Linking.getInitialURL();
        if (initial && (initial.includes('code=') || initial.includes('access_token='))) {
          console.log('🔗 [OAuth Initial URL Fallback]:', initial);
          finalUrl = initial;
        }
      }
    } finally {
      urlSubscription.remove();
    }

    // 3. Xử lý URL callback trả về từ Supabase OAuth
    if (finalUrl) {
      console.log('✅ [OAuth Success Callback]:', finalUrl);
      const hashIndex = finalUrl.indexOf('#');
      const queryIndex = finalUrl.indexOf('?');
      const fragment = hashIndex !== -1 ? finalUrl.substring(hashIndex + 1) : '';
      const queryString = queryIndex !== -1
        ? (hashIndex > queryIndex ? finalUrl.substring(queryIndex + 1, hashIndex) : finalUrl.substring(queryIndex + 1))
        : '';

      const searchParams = new URLSearchParams(queryString);
      const hashParams = new URLSearchParams(fragment);

      const code = searchParams.get('code') || hashParams.get('code');
      const accessToken = hashParams.get('access_token') || searchParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token') || searchParams.get('refresh_token');

      // Trường hợp Supabase trả về PKCE Auth Code (Mặc định trong SDK 58 & Supabase v2)
      if (code) {
        console.log('🔑 [OAuth PKCE] Đang trao đổi Auth Code lấy session...');
        const { data: sessionData, error: sessionError } = await client.auth.exchangeCodeForSession(code);
        if (sessionError) throw sessionError;
        return {
          session: sessionData.session,
          user: sessionData.user,
          providerToken: searchParams.get('provider_token') || hashParams.get('provider_token') || sessionData.session?.access_token,
        };
      }

      // Trường hợp Supabase trả về Implicit Access Token
      if (accessToken && refreshToken) {
        console.log('🔑 [OAuth Implicit] Đang thiết lập session từ Access Token...');
        const { data: sessionData, error: sessionError } = await client.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (sessionError) throw sessionError;
        return {
          session: sessionData.session,
          user: sessionData.user,
          providerToken: searchParams.get('provider_token') || hashParams.get('provider_token') || accessToken,
        };
      } else {
        console.warn('[Supabase OAuth] Không tìm thấy access_token hoặc refresh_token trong URL redirect:', url);
      }
    } else {
      console.warn('[Supabase OAuth] Trình duyệt đóng với type:', result.type);
    }

    // 4. Fallback: Nếu không lấy được URL nhưng session đã được lưu ngầm vào Storage
    const { data: fallbackSession } = await client.auth.getSession();
    if (fallbackSession?.session?.user) {
      console.log('✅ [OAuth Session Found via getSession]:', fallbackSession.session.user.email);
      return {
        session: fallbackSession.session,
        user: fallbackSession.session.user,
        providerToken: fallbackSession.session.access_token,
      };
    }

    return null;
  } catch (error: any) {
    console.warn('[Supabase OAuth Error]:', error.message);
    throw error;
  }
};

/**
 * Gửi mã OTP 6 số qua Email người dùng bằng Supabase
 */
export const sendOtpEmail = async (email: string) => {
  if (!isSupabaseConfigured()) {
    throw new Error('Chưa cấu hình Supabase URL và Anon Key.');
  }

  const client = getSupabaseClient();
  const { data, error } = await client.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: {
      shouldCreateUser: true, // Tự động tạo user nếu chưa có
    },
  });

  if (error) {
    throw error;
  }

  return data;
};

/**
 * Xác thực mã OTP 6 số do người dùng nhập
 */
export const verifyOtpEmail = async (email: string, token: string) => {
  if (!isSupabaseConfigured()) {
    throw new Error('Chưa cấu hình Supabase URL và Anon Key.');
  }

  const client = getSupabaseClient();
  const { data, error } = await client.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: 'email',
  });

  if (error) {
    throw error;
  }

  return data;
};

