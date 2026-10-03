import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { backendApi, UserProfile } from '../services/backendApi';
import {
  supabase,
  signInWithGoogleOAuth,
  isSupabaseConfigured,
  sendOtpEmail,
  verifyOtpEmail,
} from '../config/supabase';
import { ENV, syncConfigFromBackend } from '../config/env';

export type AuthMode = 'backend' | 'supabase' | 'hybrid';

export interface AuthContextType {
  user: UserProfile | null;
  supabaseUser: any | null;
  isInitializing: boolean;
  isLoading: boolean;
  authMode: AuthMode;
  setAuthMode: (mode: AuthMode) => void;
  login: (identifier: string, password: string) => Promise<{ success: boolean; message: string }>;
  signup: (data: {
    fullName: string;
    email: string;
    phone: string;
    password: string;
    otp?: string;
  }) => Promise<{ success: boolean; message: string }>;
  loginWithGoogle: () => Promise<{ success: boolean; message: string }>;
  sendOtp: (email: string) => Promise<{ success: boolean; message: string }>;
  verifyOtp: (email: string, token: string, verifyOnly?: boolean) => Promise<{ success: boolean; message: string }>;
  forgotPassword: (email: string) => Promise<{ success: boolean; message: string; resetToken?: string }>;
  verifyResetOtp: (email: string, otp: string) => Promise<{ success: boolean; message: string }>;
  resetPassword: (email: string, otp: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
  updateUserProfile: (data: {
    fullName?: string;
    dateOfBirth?: string;
    gender?: string;
    address?: string;
  }) => Promise<{ success: boolean; message: string }>;
  updateUserAvatar: (avatarUrl: string) => Promise<{ success: boolean; message: string }>;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<any | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
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
      setIsInitializing(false);
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
    otp?: string;
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
        message: res.message || 'Mã OTP đặt lại mật khẩu đã được gửi đến email của bạn.',
        resetToken: res.data?.resetToken,
      };
    } catch (err: any) {
      return { success: false, message: err.message || 'Không thể gửi yêu cầu đặt lại mật khẩu.' };
    }
  };

  /**
   * Xác thực mã OTP khôi phục mật khẩu trước khi nhập mật khẩu mới
   */
  const verifyResetOtp = async (email: string, otp: string) => {
    try {
      if (!otp.trim() || otp.trim().length !== 6) {
        return { success: false, message: 'Vui lòng nhập đủ 6 chữ số mã OTP.' };
      }

      const res = await backendApi.verifyResetOtp(email.trim().toLowerCase(), otp.trim());
      return {
        success: res.success,
        message: res.message || 'Mã OTP xác thực thành công.',
      };
    } catch (err: any) {
      return { success: false, message: err.message || 'Lỗi khi xác thực mã OTP.' };
    }
  };

  /**
   * Đặt lại mật khẩu mới bằng mã OTP
   */
  const resetPassword = async (email: string, otp: string, newPassword: string) => {
    try {
      if (!otp.trim()) {
        return { success: false, message: 'Vui lòng nhập mã OTP xác thực.' };
      }
      if (!newPassword || newPassword.length < 6) {
        return { success: false, message: 'Mật khẩu mới phải có ít nhất 6 ký tự.' };
      }

      const res = await backendApi.resetPassword({
        email: email.trim().toLowerCase(),
        token: otp.trim(),
        newPassword,
      });

      return {
        success: res.success,
        message: res.message || 'Đặt lại mật khẩu thành công! Vui lòng đăng nhập lại.',
      };
    } catch (err: any) {
      return { success: false, message: err.message || 'Lỗi khi đặt lại mật khẩu.' };
    }
  };

  /**
   * Gửi mã OTP xác thực qua Email
   * Ưu tiên gửi qua Backend SOS (kết nối Resend SMTP trực tiếp), dự phòng Supabase
   */
  const sendOtp = async (email: string) => {
    try {
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail || !cleanEmail.includes('@')) {
        return { success: false, message: 'Vui lòng nhập địa chỉ email hợp lệ.' };
      }

      // 1. Thử gửi qua Backend SOS trước (Resend SMTP trực tiếp)
      try {
        const backendRes = await backendApi.sendOtp(cleanEmail);
        if (backendRes.success) {
          return {
            success: true,
            message: `Mã OTP đã được gửi đến ${cleanEmail}. Vui lòng kiểm tra hộp thư!`,
          };
        } else if (backendRes.message && !backendRes.message.includes('Không thể kết nối')) {
          return {
            success: false,
            message: backendRes.message,
          };
        }
      } catch (backendErr) {
        console.warn('[Backend sendOtp Warning, falling back to Supabase]:', backendErr);
      }

      // 2. Dự phòng qua Supabase nếu backend chưa phản hồi
      await sendOtpEmail(cleanEmail);
      return {
        success: true,
        message: `Mã OTP đã được gửi đến ${cleanEmail}. Vui lòng kiểm tra hộp thư!`,
      };
    } catch (err: any) {
      console.warn('[sendOtp Error]:', err);
      let errMsg = err.message || 'Không thể gửi mã OTP. Vui lòng thử lại sau.';
      if (errMsg.includes('rate limit') || errMsg.includes('over_email_send_rate_limit')) {
        errMsg = 'Hệ thống đang bận. Vui lòng đợi 1 phút trước khi yêu cầu lại.';
      }
      return { success: false, message: errMsg };
    }
  };

  /**
   * Xác thực mã OTP 6 số và đăng nhập/lưu vào MongoDB backend
   */
  const verifyOtp = async (email: string, token: string, verifyOnly: boolean = false) => {
    try {
      const cleanEmail = email.trim().toLowerCase();
      const cleanToken = token.trim();

      if (!cleanToken || cleanToken.length < 6) {
        return { success: false, message: 'Vui lòng nhập đủ 6 chữ số mã OTP.' };
      }

      // 1. Thử xác thực trực tiếp với Backend SOS (MongoDB)
      try {
        const backendRes = await backendApi.verifyOtp(cleanEmail, cleanToken, verifyOnly);
        if (backendRes.success) {
          if (!verifyOnly && backendRes.data?.user) {
            setUser(backendRes.data.user);
          }
          return { success: true, message: backendRes.message || 'Xác thực OTP thành công!' };
        } else {
          return { success: false, message: backendRes.message || 'Mã OTP không chính xác.' };
        }
      } catch (backendErr: any) {
        console.warn('[Backend verifyOtp fallback to Supabase]:', backendErr);
      }

      // 2. Xác thực với Supabase nếu mã do Supabase phát hành
      const res = await verifyOtpEmail(cleanEmail, cleanToken);

      if (res && res.user) {
        setSupabaseUser(res.user);

        const fullName =
          res.user.user_metadata?.full_name ||
          res.user.user_metadata?.name ||
          cleanEmail.split('@')[0];
        const accessToken = res.session?.access_token;
        const googleId = 'otp_' + res.user.id;

        // Đồng bộ lưu thông tin người dùng vào backend SOS (MongoDB)
        try {
          const syncRes = await backendApi.loginWithGoogle({
            idToken: accessToken,
            credential: accessToken,
            googleId,
            email: res.user.email || cleanEmail,
            fullName,
          });

          if (syncRes.success && syncRes.data?.user) {
            setUser(syncRes.data.user);
            return { success: true, message: 'Đăng nhập bằng mã OTP thành công!' };
          }
        } catch (syncErr) {
          console.warn('[Backend OTP Sync Warning]:', syncErr);
        }

        const userObj: UserProfile = {
          _id: res.user.id,
          fullName,
          email: res.user.email || cleanEmail,
          roles: ['CITIZEN'],
          status: 'ACTIVE',
          isVerified: true,
        };
        setUser(userObj);
        await backendApi.saveUser(userObj);
        return { success: true, message: 'Đăng nhập OTP thành công!' };
      }

      return {
        success: false,
        message: 'Mã OTP không chính xác hoặc đã hết hạn. Vui lòng thử lại.',
      };
    } catch (err: any) {
      console.warn('[verifyOtp Error]:', err);
      let errMsg = err.message || 'Xác thực OTP thất bại. Vui lòng kiểm tra lại mã.';
      if (errMsg.includes('Token has expired') || errMsg.includes('otp_expired')) {
        errMsg = 'Mã OTP đã hết hạn. Vui lòng yêu cầu mã mới.';
      } else if (errMsg.includes('invalid') || errMsg.includes('Token is invalid')) {
        errMsg = 'Mã OTP không chính xác. Vui lòng kiểm tra lại 6 chữ số.';
      }
      return { success: false, message: errMsg };
    } finally {
      setIsLoading(false);
    }
  };

  const updateUserProfile = async (data: {
    fullName?: string;
    dateOfBirth?: string;
    gender?: string;
    address?: string;
  }) => {
    try {
      const res = await backendApi.updateProfile(data);
      if (res.success && res.data) {
        setUser(res.data);
        return { success: true, message: 'Cập nhật hồ sơ thành công' };
      }
      return { success: false, message: res.message || 'Cập nhật thất bại.' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Lỗi khi cập nhật hồ sơ.' };
    }
  };

  const updateUserAvatar = async (avatarUrl: string) => {
    try {
      const res = await backendApi.updateAvatar(avatarUrl);
      const finalAvatar = res.data?.avatarUrl || avatarUrl;

      if (user) {
        const updatedUser = { ...user, avatarUrl: finalAvatar };
        setUser(updatedUser);
        await AsyncStorage.setItem(ENV.STORAGE_KEYS.USER_DATA, JSON.stringify(updatedUser));
      }

      if (res.success) {
        return { success: true, message: 'Cập nhật ảnh đại diện thành công' };
      } else {
        return {
          success: true,
          message: 'Đã lưu ảnh đại diện trên thiết bị của bạn.',
        };
      }
    } catch (err: any) {
      if (user) {
        const updatedUser = { ...user, avatarUrl };
        setUser(updatedUser);
        await AsyncStorage.setItem(ENV.STORAGE_KEYS.USER_DATA, JSON.stringify(updatedUser));
        return { success: true, message: 'Đã lưu ảnh đại diện trên thiết bị.' };
      }
      return { success: false, message: err.message || 'Lỗi khi cập nhật ảnh đại diện.' };
    }
  };

  /**
   * Đăng xuất
   */
  const logout = async () => {
    setIsLoading(true);
    try {
      // 1. Luôn cập nhật trạng thái user về null ngay lập tức để chuyển về LoginScreen
      setUser(null);
      setSupabaseUser(null);

      // 2. Xóa sạch token và dữ liệu trong AsyncStorage
      await backendApi.clearStorage();
      await AsyncStorage.multiRemove(['@sos_emergency_contact']);

      // 3. Gửi tín hiệu hủy phiên tới backend và Supabase (không chặn UI)
      backendApi.logout().catch(() => {});
      if (isSupabaseConfigured()) {
        supabase.auth.signOut().catch(() => {});
      }
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
        isInitializing,
        isLoading,
        authMode,
        setAuthMode,
        login,
        signup,
        loginWithGoogle,
        sendOtp,
        verifyOtp,
        forgotPassword,
        verifyResetOtp,
        resetPassword,
        updateUserProfile,
        updateUserAvatar,
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
