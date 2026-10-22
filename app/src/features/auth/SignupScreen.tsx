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
import { CustomInput, PrimaryButton, GoogleButton, AlertModal, LogoSOS } from '@/components';
import { OtpModal } from './OtpModal';
import { useAuth } from '@/context/AuthContext';
import { sendPhoneOtp, verifyPhoneOtp } from '@/api';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

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
  };

  const handleVerifyAndSignup = async (otpCode: string) => {
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
  };

  const handleResendOtp = async () => {
    const res = await sendPhoneOtp(phone.trim());
    if (res.success && res.sessionInfo) {
      setPhoneSessionInfo(res.sessionInfo);
      return { success: true, message: 'Đã gửi lại mã OTP qua SMS.' };
    }
    return { success: false, message: res.message };
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

  const handleOpenTerms = (type: 'terms' | 'privacy') => {
    if (type === 'terms') {
      setAlertInfo({
        visible: true,
        type: 'info',
        title: 'Điều khoản dịch vụ',
        message:
          'Cổng cứu nạn SOS được thiết lập nhằm tiếp nhận và hỗ trợ khẩn cấp người dân trong thiên tai, bão lũ.\n\nNgười dùng có trách nhiệm cung cấp thông tin trung thực, chính xác và không báo động sai lệch.',
      });
    } else {
      setAlertInfo({
        visible: true,
        type: 'info',
        title: 'Chính sách bảo mật',
        message:
          'Hệ thống cam kết bảo mật tuyệt đối dữ liệu định vị GPS, danh tính và thông tin cuộc gọi cứu hộ của người dân.\n\nDữ liệu chỉ được phục vụ độc quyền cho các lực lượng cứu nạn thực địa.',
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
                    {/* Hiệu ứng làm mờ nền kính */}
                    <BlurView
                      intensity={Platform.OS === 'ios' ? 75 : 65}
                      tint="light"
                      style={StyleSheet.absoluteFill}
                    />

                    {/* Hiệu ứng trong suốt từ trong ra ngoài: trung tâm trắng rõ, lan ra viền siêu trong suốt */}
                    <Svg height="100%" width="100%" style={StyleSheet.absoluteFill}>
                      <Defs>
                        <RadialGradient
                          id="signupCardRadialGrad"
                          cx="50%"
                          cy="48%"
                          rx="56%"
                          ry="52%"
                        >
                          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.90" />
                          <Stop offset="42%" stopColor="#FFFFFF" stopOpacity="0.70" />
                          <Stop offset="75%" stopColor="#FFFFFF" stopOpacity="0.20" />
                          <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.03" />
                        </RadialGradient>
                      </Defs>
                      <Rect x="0" y="0" width="100%" height="100%" fill="url(#signupCardRadialGrad)" />
                    </Svg>

                    {/* Nội dung form */}
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

                      {/* Phụ đề: Giữ trên một dòng với kích cỡ phù hợp */}
                      <Text
                        style={styles.subtitle}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                      >
                        Cùng nhau chủ động – An toàn hơn trước thiên tai
                      </Text>

                      {/* Form fields: 4 ô nhập */}
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

                        {/* 3. Mật khẩu (tối thiểu 6 ký tự) */}
                        <CustomInput
                          iconName="lock"
                          placeholder="Mật khẩu (tối thiểu 6 ký tự)"
                          value={password}
                          onChangeText={setPassword}
                          isPassword
                          returnKeyType="next"
                        />

                        {/* 4. Xác nhận mật khẩu */}
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

                        {/* Đã có tài khoản? Đăng nhập gọn gàng ngay dưới Google Button */}
                        <View style={styles.formLinksContainer}>
                          <TouchableOpacity
                            onPress={onNavigateToLogin}
                            activeOpacity={0.7}
                            hitSlop={{ top: 6, bottom: 6, left: 10, right: 10 }}
                            style={styles.formSignupRow}
                          >
                            <Text style={styles.formSignupPrompt}>Đã có tài khoản? </Text>
                            <Text style={styles.formSignupLink}>Đăng nhập</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </View>
                </View>

                {/* Điều khoản & chính sách nằm dưới cùng */}
                <View style={styles.termsContainer}>
                  <Text style={styles.termsText}>
                    Bằng việc đăng ký, bạn đồng ý tuân thủ{' '}
                    <Text
                      style={styles.termsLink}
                      onPress={() => handleOpenTerms('terms')}
                    >
                      Điều khoản dịch vụ
                    </Text>
                    {' & '}
                    <Text
                      style={styles.termsLink}
                      onPress={() => handleOpenTerms('privacy')}
                    >
                      Chính sách bảo mật
                    </Text>
                    {' của Hệ thống Cứu nạn SOS.'}
                  </Text>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>

      {/* Modal Xác thực OTP Đăng ký qua SMS */}
      <OtpModal
        visible={otpModalVisible}
        type="phone"
        phone={phone.trim()}
        onClose={() => setOtpModalVisible(false)}
        onVerify={handleVerifyAndSignup}
        onResend={handleResendOtp}
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
    position: 'absolute',
    top: Platform.OS === 'ios' ? 52 : 36,
    left: 18,
    zIndex: 10,
  },
  roundButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0, 0, 0, 0.40)',
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
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  centerContainer: {
    width: '100%',
    maxWidth: 310,
    alignItems: 'center',
  },
  /* Bóng đổ mềm cho khung */
  cardShadow: {
    width: '100%',
    borderRadius: 28,
    ...Platform.select({
      ios: {
        shadowColor: '#0B192C',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.14,
        shadowRadius: 18,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  /* Viền kính mờ trong suốt và góc bo tròn 28px */
  cardInner: {
    width: '100%',
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.30)',
  },
  /* Lớp phủ kính mờ trong suốt từ trong ra ngoài */
  cardContent: {
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 18,
    alignItems: 'center',
  },
  logoWrapper: {
    alignItems: 'center',
    marginBottom: 4,
  },
  logoImage: {
    width: 76,
    height: 50,
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
    fontWeight: '700',
    letterSpacing: -0.2,
    paddingHorizontal: 2,
  },
  form: {
    width: '100%',
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
  /* Liên kết trong form: gọn gàng ngay dưới Google Button */
  formLinksContainer: {
    marginTop: 10,
    alignItems: 'center',
    width: '100%',
  },
  formSignupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  formSignupPrompt: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '600',
  },
  formSignupLink: {
    color: '#0066F5',
    fontSize: 13,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  /* Điều khoản & chính sách nằm dưới cùng */
  termsContainer: {
    marginTop: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    width: '100%',
  },
  termsText: {
    color: 'rgba(255, 255, 255, 0.90)',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    fontWeight: '500',
    ...Platform.select({
      ios: {
        textShadowColor: 'rgba(0, 0, 0, 0.95)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
      },
      android: {
        textShadowColor: 'rgba(0, 0, 0, 0.95)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
      },
    }),
  },
  termsLink: {
    color: '#60A5FA',
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
