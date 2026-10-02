import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Image,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { CustomInput } from '../components/CustomInput';
import { PrimaryButton } from '../components/PrimaryButton';
import { GoogleButton } from '../components/GoogleButton';
import { AlertModal } from '../components/AlertModal';
import { OtpModal } from './OtpModal';
import { useAuth } from '../context/AuthContext';

interface SignupScreenProps {
  onNavigateToLogin: () => void;
  onOpenSettings: () => void;
}

export const SignupScreen: React.FC<SignupScreenProps> = ({
  onNavigateToLogin,
  onOpenSettings,
}) => {
  const { signup, loginWithGoogle, sendOtp, isLoading } = useAuth();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpModalVisible, setOtpModalVisible] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);

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
    const res = await sendOtp(email.trim());
    setSendingOtp(false);

    if (res.success) {
      setOtpModalVisible(true);
    } else {
      setAlertInfo({
        visible: true,
        type: 'error',
        title: 'Lỗi gửi mã OTP',
        message: res.message,
      });
    }
  };

  const handleVerifyAndSignup = async (otpCode: string) => {
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
        message: 'Tài khoản của bạn đã được xác thực và tạo thành công!',
      });
      return { success: true };
    } else {
      return {
        success: false,
        message: res.message || 'Mã OTP không chính xác hoặc đã hết hạn.',
      };
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

      <ImageBackground
        source={require('../../assets/backgroudApp.jpg')}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          {/* Top Bar: Chỉ giữ nút Back tinh tế */}
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
              contentContainerStyle={styles.scrollContent}
              bounces={false}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Card Form Đăng ký lơ lửng bo tròn 4 góc */}
              <View style={styles.floatingCard}>
                <TouchableOpacity
                  style={styles.logoWrapper}
                  onLongPress={onOpenSettings}
                  activeOpacity={0.9}
                  delayLongPress={1500}
                >
                  <Image
                    source={require('../../assets/logoSOS.png')}
                    style={styles.logoImage}
                    resizeMode="contain"
                  />
                </TouchableOpacity>

                <Text style={styles.title}>Đăng ký</Text>
                <Text style={styles.subtitle}>
                  Cùng nhau chủ động – An toàn hơn trước thiên tai
                </Text>

                <View style={styles.form}>
                  <CustomInput
                    iconName="user"
                    placeholder="Họ và tên"
                    value={fullName}
                    onChangeText={setFullName}
                    returnKeyType="next"
                  />

                  <CustomInput
                    iconName="phone"
                    placeholder="Số điện thoại"
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    returnKeyType="next"
                  />

                  <CustomInput
                    iconName="mail"
                    placeholder="Địa chỉ Email"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    returnKeyType="next"
                  />

                  <CustomInput
                    iconName="lock"
                    placeholder="Mật khẩu (tối thiểu 6 ký tự)"
                    value={password}
                    onChangeText={setPassword}
                    isPassword
                    returnKeyType="next"
                  />

                  <CustomInput
                    iconName="shield"
                    placeholder="Xác nhận mật khẩu"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    isPassword
                    returnKeyType="done"
                    onSubmitEditing={handleSignup}
                  />

                  <PrimaryButton
                    title="Đăng ký"
                    onPress={handleSignup}
                    loading={isLoading || sendingOtp}
                  />

                  <View style={styles.dividerRow}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>Hoặc</Text>
                    <View style={styles.dividerLine} />
                  </View>

                  <GoogleButton
                    title="Đăng ký với Google"
                    onPress={handleGoogleSignup}
                    disabled={isLoading || sendingOtp}
                  />

                  {/* Chuyển sang Đăng nhập */}
                  <View style={styles.footerRow}>
                    <TouchableOpacity
                      onPress={onNavigateToLogin}
                      activeOpacity={0.7}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={styles.loginLinkWrapper}
                    >
                      <Text style={styles.loginPrompt}>Đã có tài khoản? </Text>
                      <Text style={styles.loginLink}>Đăng nhập</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </ImageBackground>

      {/* Modal Xác thực Email Đăng ký bằng mã OTP */}
      <OtpModal
        visible={otpModalVisible}
        email={email.trim()}
        onClose={() => setOtpModalVisible(false)}
        onVerify={handleVerifyAndSignup}
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
    backgroundColor: '#0F172A',
  },
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  safeArea: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  roundButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    padding: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingBottom: 4,
  },
  floatingCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.42)',
    borderRadius: 32,
    marginHorizontal: 16,
    marginBottom: Platform.OS === 'ios' ? 24 : 18,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.70)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.20,
        shadowRadius: 20,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  logoWrapper: {
    alignItems: 'center',
    marginBottom: 6,
  },
  logoImage: {
    width: 78,
    height: 54,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
    marginTop: 4,
  },
  subtitle: {
    fontSize: 13.5,
    color: '#000000',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 18,
    fontWeight: '700',
  },
  form: {
    width: '100%',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
  },
  dividerLine: {
    flex: 1,
    height: 1.5,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  dividerText: {
    paddingHorizontal: 12,
    fontSize: 13.5,
    color: '#000000',
    fontWeight: '800',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  loginLinkWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loginPrompt: {
    color: '#000000',
    fontSize: 13.5,
    fontWeight: '600',
  },
  loginLink: {
    color: '#000000',
    fontSize: 13.5,
    fontWeight: '900',
    textDecorationLine: 'underline',
  },
});
