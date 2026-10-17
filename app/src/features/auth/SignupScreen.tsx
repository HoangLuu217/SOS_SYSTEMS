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
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { CustomInput, PrimaryButton, GoogleButton, AlertModal, LogoSOS } from '@/components';
import { OtpModal } from './OtpModal';
import { useAuth } from '@/context/AuthContext';
import { sendPhoneOtp, verifyPhoneOtp } from '@/api';

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
  const [methodModalVisible, setMethodModalVisible] = useState(false);
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
        message: 'Vui lòng nhập số điện thoại hợp lệ (bắt buộc).',
      });
      return false;
    }

    // Email là tùy chọn (không bắt buộc)
    if (email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        setAlertInfo({
          visible: true,
          type: 'warning',
          title: 'Lỗi thông tin',
          message: 'Định dạng email không hợp lệ.',
        });
        return false;
      }
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

    const hasPhone = Boolean(phone.trim());
    const hasEmail = Boolean(email.trim());

    if (hasPhone && hasEmail) {
      // Có cả SĐT và Email -> Hiển thị bước chọn phương thức nhận mã
      setMethodModalVisible(true);
    } else {
      // Chỉ có SĐT -> Gửi thẳng mã về số điện thoại và mở ô nhập OTP
      sendOtpForMethod('phone');
    }
  };

  const sendOtpForMethod = async (method: 'phone' | 'email') => {
    setVerifyMethod(method);
    setMethodModalVisible(false);
    setSendingOtp(true);

    if (method === 'phone') {
      const res = await sendPhoneOtp(phone.trim());
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
      const verifyRes = await verifyPhoneOtp(phoneSessionInfo, otpCode);
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
        email: email.trim() || undefined,
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
      const res = await sendPhoneOtp(phone.trim());
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
    if (nextMethod === 'email' && !email.trim()) {
      setAlertInfo({
        visible: true,
        type: 'warning',
        title: 'Chưa có Email',
        message: 'Bạn chưa nhập địa chỉ Email khi đăng ký.',
      });
      return;
    }
    await sendOtpForMethod(nextMethod);
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

                        {/* 2. Số điện thoại (Bắt buộc) */}
                        <CustomInput
                          iconName="phone"
                          placeholder="Số điện thoại *"
                          value={phone}
                          onChangeText={setPhone}
                          keyboardType="phone-pad"
                          returnKeyType="next"
                        />

                        {/* 3. Địa chỉ Email (Tùy chọn) */}
                        <CustomInput
                          iconName="mail"
                          placeholder="Địa chỉ Email (tùy chọn)"
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

      {/* Modal Chọn Phương Thức Nhận Mã OTP (Khi có cả SĐT và Email) */}
      <Modal
        visible={methodModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMethodModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setMethodModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={e => e.stopPropagation()}>
              <View style={styles.methodModalCard}>
                <View style={styles.methodModalHeader}>
                  <View style={styles.methodModalIconWrap}>
                    <Feather name="shield" size={24} color="#0066FF" />
                  </View>
                  <Text style={styles.methodModalTitle}>Chọn phương thức nhận mã</Text>
                  <Text style={styles.methodModalSubtitle}>
                    Mã xác thực 6 số sẽ được gửi để kích hoạt tài khoản của bạn. Vui lòng chọn nơi nhận mã:
                  </Text>
                </View>

                {/* Tùy chọn 1: Số điện thoại */}
                <TouchableOpacity
                  style={styles.methodOptionCard}
                  onPress={() => sendOtpForMethod('phone')}
                  activeOpacity={0.7}
                >
                  <View style={[styles.methodOptionIcon, { backgroundColor: '#EFF6FF' }]}>
                    <Feather name="phone-call" size={20} color="#0066FF" />
                  </View>
                  <View style={styles.methodOptionTextWrap}>
                    <Text style={styles.methodOptionTitle}>Gửi qua Số điện thoại (SMS)</Text>
                    <Text style={styles.methodOptionValue}>{phone.trim()}</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color="#94A3B8" />
                </TouchableOpacity>

                {/* Tùy chọn 2: Email */}
                <TouchableOpacity
                  style={styles.methodOptionCard}
                  onPress={() => sendOtpForMethod('email')}
                  activeOpacity={0.7}
                >
                  <View style={[styles.methodOptionIcon, { backgroundColor: '#FFF7ED' }]}>
                    <Feather name="mail" size={20} color="#EA580C" />
                  </View>
                  <View style={styles.methodOptionTextWrap}>
                    <Text style={styles.methodOptionTitle}>Gửi qua Hòm thư Email</Text>
                    <Text style={styles.methodOptionValue} numberOfLines={1}>{email.trim()}</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color="#94A3B8" />
                </TouchableOpacity>

                {/* Nút Hủy */}
                <TouchableOpacity
                  style={styles.methodModalCancelBtn}
                  onPress={() => setMethodModalVisible(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.methodModalCancelText}>Hủy bỏ</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Modal Xác thực OTP Đăng ký */}
      <OtpModal
        visible={otpModalVisible}
        type={verifyMethod}
        phone={phone.trim()}
        email={email.trim()}
        onClose={() => setOtpModalVisible(false)}
        onVerify={handleVerifyAndSignup}
        onResend={handleResendOtp}
        onChangeMethod={email.trim() ? handleChangeVerifyMethod : undefined}
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
  /* Modal Chọn Phương Thức Nhận Mã */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  methodModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 24,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  methodModalHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  methodModalIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  methodModalTitle: {
    fontSize: 18.5,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center',
  },
  methodModalSubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 8,
  },
  methodOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  methodOptionIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  methodOptionTextWrap: {
    flex: 1,
  },
  methodOptionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 2,
  },
  methodOptionValue: {
    fontSize: 12.5,
    color: '#64748B',
    fontWeight: '500',
  },
  methodModalCancelBtn: {
    marginTop: 6,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  methodModalCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
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
