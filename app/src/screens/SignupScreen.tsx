import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { CustomInput } from '../components/CustomInput';
import { PrimaryButton } from '../components/PrimaryButton';
import { GoogleButton } from '../components/GoogleButton';
import { AlertModal } from '../components/AlertModal';
import { OtpModal } from './OtpModal';
import { useAuth } from '../context/AuthContext';
import { sendPhoneOtpFirebase, verifyPhoneOtpFirebase } from '../services/phoneAuthService';
import { LogoSOS } from '../components/LogoSOS';

interface SignupScreenProps {
  onNavigateToLogin: () => void;
  onOpenSettings: () => void;
}

export const SignupScreen: React.FC<SignupScreenProps> = ({
  onNavigateToLogin,
  onOpenSettings,
}) => {
  const { signup, loginWithGoogle, sendOtp, isLoading, user } = useAuth();
  const insets = useSafeAreaInsets();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Tự động làm sạch mật khẩu khi đăng xuất
  useEffect(() => {
    if (!user) {
      setPassword('');
      setConfirmPassword('');
    }
  }, [user]);
  const [otpModalVisible, setOtpModalVisible] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyMethod, setVerifyMethod] = useState<'phone' | 'email'>('phone');
  const [phoneSessionInfo, setPhoneSessionInfo] = useState('');

  const [alertInfo, setAlertInfo] = useState<{
    visible: boolean;
    type: 'success' | 'error' | 'info' | 'warning';
    title?: string;
    message: string;
    onAction?: () => void;
  }>({
    visible: false,
    type: 'info',
    message: '',
  });

  const validate = () => {
    if (!fullName.trim() || fullName.trim().length < 2) {
      setAlertInfo({
        visible: true,
        type: 'warning',
        title: 'Lỗi thông tin',
        message: 'Họ và tên phải có ít nhất 2 ký tự.',
      });
      return false;
    }

    const phoneRegex = /^(?:\+84|0)(?:3|5|7|8|9)\d{8}$|^\+?[1-9]\d{8,14}$/;
    if (!phone.trim() || !phoneRegex.test(phone.trim())) {
      setAlertInfo({
        visible: true,
        type: 'warning',
        title: 'Lỗi thông tin',
        message: 'Số điện thoại không hợp lệ (hỗ trợ định dạng VN 10 số).',
      });
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email.trim())) {
      setAlertInfo({
        visible: true,
        type: 'warning',
        title: 'Lỗi thông tin',
        message: 'Định dạng email không hợp lệ.',
      });
      return false;
    }

    if (!password || password.length < 6) {
      setAlertInfo({
        visible: true,
        type: 'warning',
        title: 'Mật khẩu yếu',
        message: 'Mật khẩu phải có độ dài tối thiểu 6 ký tự.',
      });
      return false;
    }

    if (password !== confirmPassword) {
      setAlertInfo({
        visible: true,
        type: 'warning',
        title: 'Mật khẩu không khớp',
        message: 'Mật khẩu xác nhận không khớp với mật khẩu đã nhập.',
      });
      return false;
    }

    return true;
  };

  const handleSignup = async () => {
    if (!validate()) return;

    setSendingOtp(true);

    if (verifyMethod === 'phone') {
      const res = await sendPhoneOtpFirebase(phone.trim());
      setSendingOtp(false);
      if (res.success && res.sessionInfo) {
        setPhoneSessionInfo(res.sessionInfo);
        setOtpModalVisible(true);
      } else {
        setAlertInfo({
          visible: true,
          type: 'error',
          title: 'Lỗi gửi mã OTP qua SMS',
          message: res.message || 'Không thể gửi mã xác thực qua số điện thoại.',
        });
      }
    } else {
      const res = await sendOtp(email.trim());
      setSendingOtp(false);
      if (res.success) {
        setOtpModalVisible(true);
      } else {
        setAlertInfo({
          visible: true,
          type: 'error',
          title: 'Lỗi gửi mã OTP qua Email',
          message: res.message,
        });
      }
    }
  };

  const handleVerifyAndSignup = async (otpCode: string) => {
    if (verifyMethod === 'phone') {
      const verifyRes = await verifyPhoneOtpFirebase(phoneSessionInfo, otpCode);
      if (!verifyRes.success) {
        return {
          success: false,
          message: verifyRes.message || 'Mã OTP số điện thoại không chính xác.',
        };
      }

      // Đăng ký với số điện thoại đã xác thực
      const res = await signup({
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        password,
      });

      if (res.success) {
        setAlertInfo({
          visible: true,
          type: 'success',
          title: 'Đăng ký thành công',
          message: 'Tài khoản của bạn đã được xác thực số điện thoại và tạo thành công!',
        });
        return { success: true };
      } else {
        return {
          success: false,
          message: res.message || 'Đăng ký tài khoản thất bại.',
        };
      }
    } else {
      // Xác thực qua Email OTP
      const res = await signup({
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        password,
        otp: otpCode,
      });

      if (res.success) {
        setAlertInfo({
          visible: true,
          type: 'success',
          title: 'Đăng ký thành công',
          message: 'Tài khoản của bạn đã được xác thực email và tạo thành công!',
        });
        return { success: true };
      } else {
        return {
          success: false,
          message: res.message || 'Mã OTP không chính xác hoặc đã hết hạn.',
        };
      }
    }
  };

  const handleResendOtp = async () => {
    if (verifyMethod === 'phone') {
      const res = await sendPhoneOtpFirebase(phone.trim());
      if (res.success && res.sessionInfo) {
        setPhoneSessionInfo(res.sessionInfo);
        return { success: true, message: 'Đã gửi lại mã OTP qua SMS.' };
      }
      return { success: false, message: res.message };
    } else {
      const res = await sendOtp(email.trim());
      return res;
    }
  };

  const handleChangeVerifyMethod = async () => {
    const nextMethod = verifyMethod === 'phone' ? 'email' : 'phone';
    setVerifyMethod(nextMethod);
    setSendingOtp(true);
    if (nextMethod === 'phone') {
      const res = await sendPhoneOtpFirebase(phone.trim());
      setSendingOtp(false);
      if (res.success && res.sessionInfo) {
        setPhoneSessionInfo(res.sessionInfo);
      } else {
        setAlertInfo({
          visible: true,
          type: 'error',
          title: 'Lỗi gửi mã OTP qua SMS',
          message: res.message || 'Không thể gửi mã xác thực qua số điện thoại.',
        });
      }
    } else {
      const res = await sendOtp(email.trim());
      setSendingOtp(false);
      if (!res.success) {
        setAlertInfo({
          visible: true,
          type: 'error',
          title: 'Lỗi gửi mã OTP qua Email',
          message: res.message,
        });
      }
    }
  };

  const handleGoogleSignup = async () => {
    const res = await loginWithGoogle();
    if (!res.success && res.message) {
      setAlertInfo({
        visible: true,
        type: res.message.includes('src/config/env.ts') ? 'info' : 'error',
        title: res.message.includes('src/config/env.ts') ? 'Cấu hình Supabase' : 'Lỗi xác thực Google',
        message: res.message,
      });
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Vùng hiển thị form đăng ký với nền trong suốt (nền ảnh duy trì tại cấp cha) */}
      <View style={styles.backgroundImage}>
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          {/* Top Bar: Nút Back tròn tinh tế */}
          <View style={styles.topBar}>
            <TouchableOpacity
              style={styles.roundButton}
              onPress={onNavigateToLogin}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Feather name="arrow-left" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.keyboardView}
          >
            <ScrollView
              contentContainerStyle={[
                styles.scrollContent,
                { paddingBottom: Math.max(20, insets.bottom + 12) },
              ]}
              bounces={false}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.centerContainer}>
                {/* Khung đăng ký kính mờ xanh xám (Frosted Glass Card) */}
                <View style={styles.cardShadow}>
                  <View style={styles.cardInner}>
                    {/* Hiệu ứng làm mờ nền mạnh mẽ */}
                    <BlurView
                      intensity={Platform.OS === 'ios' ? 85 : 75}
                      tint="light"
                      style={StyleSheet.absoluteFill}
                    />

                    {/* Lớp phủ màu xanh xám rgba(210, 225, 240, 0.65) */}
                    <View style={styles.cardContent}>
                      {/* Logo RescueSOS - Bấm giữ 2s mở cấu hình IP */}
                      <TouchableOpacity
                        style={styles.logoWrapper}
                        onLongPress={onOpenSettings}
                        activeOpacity={0.9}
                        delayLongPress={1500}
                      >
                        <LogoSOS
                          style={styles.logoImage}
                          resizeMode="contain"
                        />
                      </TouchableOpacity>

                      {/* Tiêu đề: Đăng ký */}
                      <Text style={styles.title}>Đăng ký</Text>

                      {/* Phụ đề: Tối đa hai dòng, chữ xanh navy */}
                      <Text style={styles.subtitle} numberOfLines={2}>
                        Cùng nhau chủ động – An toàn hơn trước{'\n'}thiên tai
                      </Text>

                      {/* Form fields: 5 ô nhập */}
                      <View style={styles.form}>
                        {/* 1. Họ và tên */}
                        <CustomInput
                          iconName="user"
                          placeholder="Họ và tên"
                          value={fullName}
                          onChangeText={setFullName}
                          returnKeyType="next"
                        />

                        {/* 2. Số điện thoại */}
                        <CustomInput
                          iconName="phone"
                          placeholder="Số điện thoại"
                          value={phone}
                          onChangeText={setPhone}
                          keyboardType="phone-pad"
                          returnKeyType="next"
                        />

                        {/* 3. Địa chỉ Email */}
                        <CustomInput
                          iconName="mail"
                          placeholder="Địa chỉ Email"
                          value={email}
                          onChangeText={setEmail}
                          keyboardType="email-address"
                          autoCapitalize="none"
                          returnKeyType="next"
                        />

                        {/* 4. Mật khẩu (tối thiểu 6 ký tự) */}
                        <CustomInput
                          iconName="lock"
                          placeholder="Mật khẩu (tối thiểu 6 ký tự)"
                          value={password}
                          onChangeText={setPassword}
                          isPassword
                          returnKeyType="next"
                        />

                        {/* 5. Xác nhận mật khẩu */}
                        <CustomInput
                          iconName="shield"
                          placeholder="Xác nhận mật khẩu"
                          value={confirmPassword}
                          onChangeText={setConfirmPassword}
                          isPassword
                          returnKeyType="done"
                          onSubmitEditing={handleSignup}
                        />

                        {/* Phương thức nhận mã xác thực OTP: SĐT hoặc Email */}
                        <View style={styles.methodSelectorWrap}>
                          <Text style={styles.methodSelectorLabel}>Nhận mã OTP qua:</Text>
                          <View style={styles.methodPillsRow}>
                            <TouchableOpacity
                              style={[
                                styles.methodPill,
                                verifyMethod === 'phone' && styles.methodPillActive,
                              ]}
                              onPress={() => setVerifyMethod('phone')}
                              activeOpacity={0.8}
                            >
                              <Feather
                                name="phone"
                                size={13}
                                color={verifyMethod === 'phone' ? '#0066FF' : '#475569'}
                                style={{ marginRight: 4 }}
                              />
                              <Text
                                style={[
                                  styles.methodPillText,
                                  verifyMethod === 'phone' && styles.methodPillTextActive,
                                ]}
                              >
                                Số điện thoại
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[
                                styles.methodPill,
                                verifyMethod === 'email' && styles.methodPillActive,
                              ]}
                              onPress={() => setVerifyMethod('email')}
                              activeOpacity={0.8}
                            >
                              <Feather
                                name="mail"
                                size={13}
                                color={verifyMethod === 'email' ? '#0066FF' : '#475569'}
                                style={{ marginRight: 4 }}
                              />
                              <Text
                                style={[
                                  styles.methodPillText,
                                  verifyMethod === 'email' && styles.methodPillTextActive,
                                ]}
                              >
                                Email
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>

                        {/* Nút Đăng ký màu xanh với mũi tên */}
                        <PrimaryButton
                          title="Đăng ký"
                          onPress={handleSignup}
                          loading={isLoading || sendingOtp}
                        />

                        {/* Divider Hoặc */}
                        <View style={styles.dividerRow}>
                          <View style={styles.dividerLine} />
                          <Text style={styles.dividerText}>Hoặc</Text>
                          <View style={styles.dividerLine} />
                        </View>

                        {/* Nút trắng: Đăng ký với Google */}
                        <GoogleButton
                          title="Đăng ký với Google"
                          onPress={handleGoogleSignup}
                          disabled={isLoading || sendingOtp}
                        />
                      </View>
                    </View>
                  </View>
                </View>

                {/* Liên kết bên ngoài dưới khung: Đã có tài khoản? Đăng nhập */}
                <View style={styles.outsideLinkContainer}>
                  <TouchableOpacity
                    onPress={onNavigateToLogin}
                    activeOpacity={0.7}
                    hitSlop={{ top: 10, bottom: 10, left: 16, right: 16 }}
                    style={styles.outsideLoginRow}
                  >
                    <Text style={styles.outsideLoginPrompt}>Đã có tài khoản? </Text>
                    <Text style={styles.outsideLoginLink}>Đăng nhập</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>

      {/* Modal Xác thực OTP Đăng ký (Hỗ trợ cả SĐT và Email) */}
      <OtpModal
        visible={otpModalVisible}
        type={verifyMethod}
        phone={phone.trim()}
        email={email.trim()}
        onClose={() => setOtpModalVisible(false)}
        onVerify={handleVerifyAndSignup}
        onResend={handleResendOtp}
        onChangeMethod={handleChangeVerifyMethod}
      />

      <AlertModal
        visible={alertInfo.visible}
        type={alertInfo.type}
        title={alertInfo.title}
        message={alertInfo.message}
        onClose={() => setAlertInfo(prev => ({ ...prev, visible: false }))}
        onAction={alertInfo.onAction}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
  safeArea: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: '5%',
    paddingTop: 6,
    paddingBottom: 6,
  },
  roundButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: '5%',
    paddingTop: 6,
  },
  centerContainer: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  /* Bóng đổ mềm cho khung */
  cardShadow: {
    width: '100%',
    borderRadius: 28,
    ...Platform.select({
      ios: {
        shadowColor: '#0B192C',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.16,
        shadowRadius: 20,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  /* Viền trắng mảnh và bo góc 28px */
  cardInner: {
    width: '100%',
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.75)',
  },
  /* Lớp phủ kính mờ xanh xám: rgba(210, 225, 240, 0.65) */
  cardContent: {
    backgroundColor: 'rgba(210, 225, 240, 0.65)',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    alignItems: 'center',
  },
  logoWrapper: {
    alignItems: 'center',
    marginBottom: 4,
  },
  logoImage: {
    width: 74,
    height: 48,
  },
  title: {
    fontSize: 23,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12.5,
    color: '#0F172A',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 14,
    lineHeight: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
    paddingHorizontal: 8,
  },
  form: {
    width: '100%',
  },
  /* Selector phương thức OTP */
  methodSelectorWrap: {
    marginBottom: 10,
    marginTop: 2,
  },
  methodSelectorLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
    paddingLeft: 2,
  },
  methodPillsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  methodPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    borderRadius: 12,
    paddingVertical: 8,
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  methodPillActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#0066FF',
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  methodPillText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#475569',
  },
  methodPillTextActive: {
    color: '#0066FF',
    fontWeight: '700',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.20)',
  },
  dividerText: {
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#334155',
    fontWeight: '700',
  },
  /* Liên kết ngoài dưới khung */
  outsideLinkContainer: {
    marginTop: 20,
    alignItems: 'center',
    width: '100%',
  },
  outsideLoginRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  outsideLoginPrompt: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '500',
    ...Platform.select({
      ios: {
        textShadowColor: 'rgba(0, 0, 0, 0.9)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
      },
      android: {
        textShadowColor: 'rgba(0, 0, 0, 0.9)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
      },
    }),
  },
  outsideLoginLink: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
    textDecorationLine: 'underline',
    ...Platform.select({
      ios: {
        textShadowColor: 'rgba(0, 0, 0, 0.9)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
      },
      android: {
        textShadowColor: 'rgba(0, 0, 0, 0.9)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
      },
    }),
  },
});
