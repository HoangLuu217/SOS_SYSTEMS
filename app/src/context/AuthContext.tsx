import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { backendApi, UserProfile } from '../services/backendApi';
import { supabase, signInWithGoogleOAuth, isSupabaseConfigured } from '../config/supabase';
import { ENV, syncConfigFromBackend } from '../config/env';

export type AuthMode = 'backend' | 'supabase' | 'hybrid';

export interface AuthContextType {
  user: UserProfile | null;
  supabaseUser: any | null;
  isLoading: boolean;
  authMode: AuthMode;
  setAuthMode: (mode: AuthMode) => void;
  login: (identifier: string, password: string) => Promise<{ success: boolean; message: string }>;
  signup: (data: {
    fullName: string;
    email: string;
    phone: string;
    password: string;
  }) => Promise<{ success: boolean; message: string }>;
  loginWithGoogle: () => Promise<{ success: boolean; message: string }>;
  forgotPassword: (email: string) => Promise<{ success: boolean; message: string; resetToken?: string }>;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [authMode, setAuthModeState] = useState<AuthMode>('hybrid');

  const setAuthMode = async (mode: AuthMode) => {
    setAuthModeState(mode);
    await AsyncStorage.setItem(ENV.STORAGE_KEYS.AUTH_MODE, mode);
  };

  const checkSession = async () => {
    try {
      setIsLoading(true);

      // 0. Đồng bộ cấu hình Supabase từ backend/.env nếu có kết nối
      const baseUrl = await backendApi.getBaseUrl();
      await syncConfigFromBackend(baseUrl);

      // 1. Kiểm tra session từ SOS Backend
      const storedUser = await backendApi.getStoredUser();
      const accessToken = await AsyncStorage.getItem(ENV.STORAGE_KEYS.ACCESS_TOKEN);

      if (storedUser && accessToken) {
        setUser(storedUser);
      }

      // 2. Kiểm tra session từ Supabase nếu có
      if (isSupabaseConfigured()) {
        const { data } = await supabase.auth.getSession();
        if (data?.session?.user) {
          setSupabaseUser(data.session.user);
          if (!storedUser) {
            // Khởi tạo user profile từ Supabase nếu backend chưa có
            setUser({
              _id: data.session.user.id,
              fullName: data.session.user.user_metadata?.full_name || data.session.user.email?.split('@')[0] || 'User',
              email: data.session.user.email || '',
              roles: ['CITIZEN'],
              status: 'ACTIVE',
              isVerified: true,
            });
          }
        }
      }

      // 3. Khôi phục authMode lưu trữ
      const savedMode = (await AsyncStorage.getItem(ENV.STORAGE_KEYS.AUTH_MODE)) as AuthMode | null;
      if (savedMode) {
        setAuthModeState(savedMode);
      }
    } catch (err) {
      console.warn('Lỗi khi khôi phục phiên đăng nhập:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkSession();
  }, []);

  /**
   * Đăng nhập
   */
  const login = async (identifier: string, password: string) => {
    setIsLoading(true);
    try {
      if (!identifier.trim() || !password) {
        return { success: false, message: 'Vui lòng nhập đầy đủ thông tin tài khoản và mật khẩu.' };
      }

      // Nếu người dùng chọn thuần Supabase
      if (authMode === 'supabase' && isSupabaseConfigured()) {
        const isEmail = identifier.includes('@');
        if (!isEmail) {
          return {
            success: false,
            message: 'Supabase Auth yêu cầu đăng nhập bằng Email.',
          };
        }

        const { data, error } = await supabase.auth.signInWithPassword({
          email: identifier.trim(),
          password,
        });

        if (error) {
          return { success: false, message: error.message };
        }

        if (data.user) {
          setSupabaseUser(data.user);
          const userObj: UserProfile = {
            _id: data.user.id,
            fullName: data.user.user_metadata?.full_name || identifier.split('@')[0],
            email: data.user.email || identifier,
            roles: ['CITIZEN'],
            status: 'ACTIVE',
            isVerified: true,
          };
          setUser(userObj);
          await backendApi.saveUser(userObj);
          return { success: true, message: 'Đăng nhập Supabase thành công!' };
        }
      }

      // Mặc định hoặc chế độ Hybrid / Backend: Gọi backend SOS Express API
      const res = await backendApi.login({ identifier, password });

      if (res.success && res.data?.user) {
        setUser(res.data.user);
        return { success: true, message: res.message || 'Đăng nhập thành công!' };
      }

      return {
        success: false,
        message: res.message || 'Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.',
      };
    } catch (err: any) {
      return { success: false, message: err.message || 'Đã xảy ra lỗi khi đăng nhập.' };
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Đăng ký tài khoản
   */
  const signup = async (data: {
    fullName: string;
    email: string;
    phone: string;
    password: string;
  }) => {
    setIsLoading(true);
    try {
      // 1. Đăng ký với SOS Backend
      const backendRes = await backendApi.register(data);

      if (!backendRes.success) {
        return { success: false, message: backendRes.message };
      }

      if (backendRes.data?.user) {
        setUser(backendRes.data.user);
      }

      // 2. Đồng bộ tạo tài khoản trên Supabase nếu đã cấu hình
      if (isSupabaseConfigured()) {
        try {
          const { data: supaData } = await supabase.auth.signUp({
            email: data.email.trim(),
            password: data.password,
            options: {
              data: {
                full_name: data.fullName.trim(),
                phone: data.phone.trim(),
              },
            },
          });
          if (supaData?.user) {
            setSupabaseUser(supaData.user);
          }
        } catch (supaErr) {
          console.warn('[Supabase Sync Warning]:', supaErr);
        }
      }

      return {
        success: true,
        message: backendRes.message || 'Đăng ký tài khoản thành công!',
      };
    } catch (err: any) {
      return { success: false, message: err.message || 'Đã có lỗi xảy ra khi đăng ký.' };
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Đăng nhập với Google:
   * - Sử dụng Supabase Auth Google OAuth hoặc Google ID Token
   * - Sau đó đồng bộ session với SOS Backend (/auth/google)
   */
  const loginWithGoogle = async () => {
    setIsLoading(true);
    try {
      if (isSupabaseConfigured()) {
        const result = await signInWithGoogleOAuth();
        if (result && result.session && result.user) {
          setSupabaseUser(result.user);

          // Đồng bộ thông tin người dùng Google sang backend SOS để lưu vào MongoDB
          const tokenToSend = result.session.access_token || result.providerToken;
          const googleId =
            result.user.user_metadata?.sub ||
            result.user.id ||
            result.user.identities?.[0]?.identity_data?.sub;
          const email = result.user.email || result.user.user_metadata?.email;
          const fullName =
            result.user.user_metadata?.full_name ||
            result.user.user_metadata?.name ||
            email?.split('@')[0] ||
            'Google User';
          const avatarUrl =
            result.user.user_metadata?.avatar_url ||
            result.user.user_metadata?.picture;

          try {
            const backendRes = await backendApi.loginWithGoogle({
              idToken: tokenToSend,
              credential: tokenToSend,
              googleId,
              email,
              fullName,
              avatarUrl,
            });

            if (backendRes.success && backendRes.data?.user) {
              setUser(backendRes.data.user);
              return { success: true, message: 'Đăng nhập Google và lưu vào Database thành công!' };
            } else {
              console.warn('[Backend Sync Error]:', backendRes.message);
            }
          } catch (syncErr) {
            console.warn('Backend sync error:', syncErr);
          }

          // Dù backend chưa kết nối thì phiên Supabase vẫn hợp lệ
          const userObj: UserProfile = {
            _id: result.user.id,
            fullName: result.user.user_metadata?.full_name || result.user.email?.split('@')[0] || 'Google User',
            email: result.user.email || '',
            avatarUrl: result.user.user_metadata?.avatar_url,
            roles: ['CITIZEN'],
            status: 'ACTIVE',
            isVerified: true,
          };
          setUser(userObj);
          return { success: true, message: 'Đăng nhập Google thông qua Supabase thành công!' };
        } else {
          return { success: false, message: 'Quá trình đăng nhập Google bị hủy.' };
        }
      } else {
        // Thông báo cấu hình Supabase với hướng dẫn dễ hiểu
        return {
          success: false,
          message:
            'Chưa cấu hình Supabase URL & Anon Key thực tế trong src/config/env.ts.\n\nVui lòng điền thông tin Supabase Project của bạn để kích hoạt Google OAuth.',
        };
      }
    } catch (err: any) {
      return { success: false, message: err.message || 'Lỗi khi đăng nhập bằng Google.' };
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Quên mật khẩu
   */
  const forgotPassword = async (email: string) => {
    setIsLoading(true);
    try {
      if (!email.trim() || !email.includes('@')) {
        return { success: false, message: 'Vui lòng nhập địa chỉ email hợp lệ.' };
      }

      // Gọi backend SOS
      const res = await backendApi.forgotPassword(email);

      // Đồng thời gọi Supabase nếu cấu hình
      if (isSupabaseConfigured()) {
        try {
          await supabase.auth.resetPasswordForEmail(email.trim());
        } catch {}
      }

      return {
        success: res.success,
        message: res.message || 'Hướng dẫn đặt lại mật khẩu đã được gửi đến email của bạn.',
        resetToken: res.data?.resetToken,
      };
    } catch (err: any) {
      return { success: false, message: err.message || 'Không thể gửi yêu cầu đặt lại mật khẩu.' };
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Đăng xuất
   */
  const logout = async () => {
    setIsLoading(true);
    try {
      await backendApi.logout();
      if (isSupabaseConfigured()) {
        await supabase.auth.signOut();
      }
      setUser(null);
      setSupabaseUser(null);
    } catch (err) {
      console.warn('Lỗi đăng xuất:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        supabaseUser,
        isLoading,
        authMode,
        setAuthMode,
        login,
        signup,
        loginWithGoogle,
        forgotPassword,
        logout,
        checkSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
