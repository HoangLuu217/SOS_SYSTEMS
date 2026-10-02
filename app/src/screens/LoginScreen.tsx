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
import { useAuth } from '../context/AuthContext';

interface LoginScreenProps {
  onNavigateToSignup: () => void;
  onNavigateToForgotPassword: () => void;
  onOpenSettings: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onNavigateToSignup,
  onNavigateToForgotPassword,
  onOpenSettings,
}) => {
  const { login, loginWithGoogle, isLoading } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [alertInfo, setAlertInfo] = useState<{
    visible: boolean;
    type: 'success' | 'error' | 'info' | 'warning';
    title?: string;
    message: string;
  }>({
    visible: false,
    type: 'info',
    message: '',
  });

  const handleLogin = async () => {
    if (!identifier.trim()) {
      setAlertInfo({
        visible: true,
        type: 'warning',
        title: 'Thiếu thông tin',
        message: 'Vui lòng nhập số điện thoại hoặc email.',
      });
      return;
    }

    if (!password) {
      setAlertInfo({
        visible: true,
        type: 'warning',
        title: 'Thiếu thông tin',
        message: 'Vui lòng nhập mật khẩu.',
      });
      return;
    }

    const res = await login(identifier.trim(), password);
    if (!res.success) {
      setAlertInfo({
        visible: true,
        type: 'error',
        title: 'Đăng nhập không thành công',
        message: res.message,
      });
    }
  };

  const handleGoogleLogin = async () => {
    const res = await loginWithGoogle();
    if (!res.success && res.message) {
      setAlertInfo({
        visible: true,
        type: res.message.includes('src/config/env.ts') ? 'info' : 'error',
        title: res.message.includes('src/config/env.ts') ? 'Cấu hình Supabase' : 'Lỗi đăng nhập Google',
        message: res.message,
      });
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Ảnh nền bão lũ / trực thăng cứu hộ tràn viền */}
      <ImageBackground
        source={require('../../assets/backgroudApp.jpg')}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
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
              {/* Card Form đăng nhập lơ lửng bo tròn 4 góc (Floating Glassmorphism Card) chuẩn theo hình 2 */}
              <View style={styles.floatingCard}>
                {/* Logo ứng dụng - Bấm giữ 2s để mở bảng cài đặt IP/Supabase khi cần */}
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

                {/* Tiêu đề & phụ đề */}
                <Text style={styles.title}>Đăng nhập</Text>
                <Text style={styles.subtitle}>
                  Cùng nhau chủ động – An toàn hơn trước thiên tai
                </Text>

                {/* Form fields */}
                <View style={styles.form}>
                  <CustomInput
                    iconName="user"
                    placeholder="Số điện thoại hoặc email"
                    value={identifier}
                    onChangeText={setIdentifier}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    returnKeyType="next"
                  />

                  <CustomInput
                    iconName="lock"
                    placeholder="Mật khẩu"
                    value={password}
                    onChangeText={setPassword}
                    isPassword
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                  />

                  {/* Nút Đăng nhập */}
                  <PrimaryButton
                    title="Đăng nhập"
                    onPress={handleLogin}
                    loading={isLoading}
                  />

                  {/* Divider Hoặc */}
                  <View style={styles.dividerRow}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>Hoặc</Text>
                    <View style={styles.dividerLine} />
                  </View>

                  {/* Nút Đăng nhập với Google */}
                  <GoogleButton
                    title="Đăng nhập với Google"
                    onPress={handleGoogleLogin}
                    disabled={isLoading}
                  />

                  {/* Footer Links: Quên mật khẩu & Đăng ký */}
                  <View style={styles.footerRow}>
                    <TouchableOpacity
                      onPress={onNavigateToForgotPassword}
                      activeOpacity={0.7}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Text style={styles.forgotPasswordText}>Quên mật khẩu?</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={onNavigateToSignup}
                      activeOpacity={0.7}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={styles.signupLinkWrapper}
                    >
                      <Text style={styles.signupPrompt}>Chưa có tài khoản? </Text>
                      <Text style={styles.signupLink}>Đăng ký</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </ImageBackground>

      {/* Modal thông báo */}
      <AlertModal
        visible={alertInfo.visible}
        type={alertInfo.type}
        title={alertInfo.title}
        message={alertInfo.message}
        onClose={() => setAlertInfo(prev => ({ ...prev, visible: false }))}
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
  keyboardView: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingBottom: 4,
  },
  /* Card lơ lửng bo tròn 4 góc với hiệu ứng kính mờ (Frosted Glass) trong suốt */
  floatingCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.42)',
    borderRadius: 32,
    marginHorizontal: 16,
    marginBottom: Platform.OS === 'ios' ? 24 : 18,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 22,
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
    width: 82,
    height: 57,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
    marginTop: 6,
  },
  subtitle: {
    fontSize: 13.5,
    color: '#000000',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
    lineHeight: 18,
    fontWeight: '700',
  },
  form: {
    width: '100%',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 18,
    paddingHorizontal: 4,
  },
  forgotPasswordText: {
    color: '#000000',
    fontSize: 13.5,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  signupLinkWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  signupPrompt: {
    color: '#000000',
    fontSize: 13.5,
    fontWeight: '600',
  },
  signupLink: {
    color: '#000000',
    fontSize: 13.5,
    fontWeight: '900',
    textDecorationLine: 'underline',
  },
});
